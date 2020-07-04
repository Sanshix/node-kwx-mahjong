var crypto = require('../utils/crypto');
var express = require('express');
var db = require('../utils/db');
var http = require('../utils/http');
var room_service = require("./room_service");

var app = express();
var config = null;

function check_account(req, res) {
    var account = req.query.account;
    var sign = req.query.sign;
    if (null == account || null == sign) {
        http.send(res, 1, "unknown err.");
        return false;
    }

    /*
     var serverSign = crypto.md5(account + req.ip + config.ACCOUNT_PRI_KEY);
     if(serverSign != sign){
     http.send(res,2,"login failed.");
     return false;
     }
     */

    return true;
}

app.all('*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
    res.header("X-Powered-By", ' 3.2.1');
    res.header("Content-Type", "application/json;charset=utf-8");
    next();
});

app.get('/login', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }

    var ip = req.ip;
    if (ip.indexOf("::ffff:") != -1) {
        ip = ip.substr(7);
    }

    var account = req.query.account;
    db.get_user_data(account, function (data) {
        if (null == data) {
            http.send(res, 0, "ok");
            return;
        }

        var ret = {
            account: data.account,
            userid: data.userid,
            name: data.name,
            lv: data.lv,
            exp: data.exp,
            coins: data.coins,
            gems: data.gems,
            ip: ip,
            sex: data.sex,
        };

        db.get_room_id_of_user(data.userid, function (roomId) {
            if (roomId != null) {
                db.is_room_exist(roomId, function (retval) {
                    if (retval) {
                        ret.roomid = roomId;
                    } else {
                        db.set_room_id_of_user(data.userid, null);
                    }

                    http.send(res, 0, "ok", ret);
                });
            } else {
                http.send(res, 0, "ok", ret);
            }
        });
    });
});

app.get('/create_user', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }

    var account = req.query.account;
    var name = req.query.name;
    var coins = 0; // 默认为0
    var gems = 21;

    console.log(name);

    db.is_user_exist(account, function (ret) {
        if (!ret) {
            db.create_user(account, name, coins, gems, 0, null, function (ret) {
                if (null == ret) {
                    http.send(res, 2, "system error.");
                } else {
                    http.send(res, 0, "ok");
                }
            });
        } else {
            http.send(res, 1, "account have already exist.");
        }
    });
});

app.get('/create_private_room', function (req, res) {
    var data = req.query;
    if (!check_account(req, res)) {
        return;
    }

    var account = data.account;

    data.account = null;
    data.sign = null;
    var conf = data.conf;
    db.get_user_data(account, function (data) {
        if (null == data) {
            http.send(res, 1, "system error");
            return;
        }

        var userId = data.userid;
        var name = data.name;
        var org_id = data.org_id || 0;
        db.get_room_id_of_user(userId, function (roomId) {
            if (roomId != null) {
                http.send(res, -1, "user is playing in room now.");
                return;
            }
            room_service.createRoom(account, userId, conf,org_id, function (err, roomId) {
                if (err == 0 && roomId != null) {
                    if (org_id != 0){
                        return http.send(res, 0, "ok", ret);
                    }
                    room_service.enterRoom(userId, name, roomId, function (errcode, enterInfo) {
                        if (enterInfo) {
                            var ret = {
                                roomid: roomId,
                                ip: enterInfo.ip,
                                port: enterInfo.port,
                                token: enterInfo.token,
                                time: Date.now()
                            };

                            ret.sign = crypto.md5(ret.roomid + ret.token + ret.time + config.ROOM_PRI_KEY);
                            http.send(res, 0, "ok", ret);
                        } else {
                            http.send(res, errcode, "room doesn't exist.");
                        }
                    });
                } else {
                    http.send(res, err, "create failed.");
                }
            });
        });
    });
});

app.get('/enter_private_room', function (req, res) {
    var data = req.query;
    var roomId = data.roomid;
    if (null == roomId) {
        http.send(res, -1, "parameters don't match api requirements.");
        return;
    }

    if (!check_account(req, res)) {
        return;
    }

    var account = data.account;

    db.get_user_data(account, function (data) {
        if (null == data) {
            http.send(res, -1, "system error");
            return;
        }

        var userId = data.userid;
        var name = data.name;

        // TODO: 验证玩家状态
        room_service.enterRoom(userId, name, roomId, function (errcode, enterInfo) {
            if (enterInfo) {
                var ret = {
                    roomid: roomId,
                    ip: enterInfo.ip,
                    port: enterInfo.port,
                    token: enterInfo.token,
                    time: Date.now()
                };

                ret.sign = crypto.md5(roomId + ret.token + ret.time + config.ROOM_PRI_KEY);
                http.send(res, 0, "ok", ret);
            } else {
                http.send(res, errcode, "enter room failed.");
            }
        });
    });
});

app.get('/get_history_list', function (req, res) {
    var data = req.query;
    if (!check_account(req, res)) {
        return;
    }

    var account = data.account;
    db.get_user_data(account, function (data) {
        if (null == data) {
            http.send(res, -1, "system error");
            return;
        }

        var userId = data.userid;
        db.get_user_history(userId, function (history) {
            http.send(res, 0, "ok", { history: history });
        });
    });
});

app.get('/get_games_of_room', function (req, res) {
    var data = req.query;
    var uuid = data.uuid;
    if (uuid == null) {
        http.send(res, -1, "bad param");
        return;
    }

    if (!check_account(req, res)) {
        return;
    }

    db.get_games_of_room(uuid, function (data) {
        console.log(data);
        http.send(res, 0, "ok", { data: data });
    });
});

app.get('/get_detail_of_game', function (req, res) {
    var data = req.query;
    var uuid = data.uuid;
    var index = data.index;
    if (uuid == null || index == null) {
        http.send(res, -1, "bad param");
        return;
    }

    if (!check_account(req, res)) {
        return;
    }

    db.get_detail_of_game(uuid, index, function (data) {
        http.send(res, 0, "ok", { data: data });
    });
});

app.get('/get_user_status', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }

    var account = req.query.account;
    db.get_gems(account, function (data) {
        if (data != null) {
            http.send(res, 0, "ok", { gems: data.gems });
        } else {
            http.send(res, 1, "get gems failed.");
        }
    });
});

app.get('/get_message', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }

    var type = req.query.type;

    if (type == null) {
        http.send(res, -1, "bad param");
        return;
    }

    var version = req.query.version;
    db.get_message(type, version, function (data) {
        if (data != null) {
            http.send(res, 0, "ok", { msg: data.msg, version: data.version });
        } else {
            http.send(res, 1, "get message failed.");
        }
    });
});

app.get('/is_server_online', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }

    var ip = req.query.ip;
    var port = req.query.port;
    room_service.isServerOnline(ip, port, function (isonline) {
        var ret = {
            isonline: isonline
        };

        http.send(res, 0, "ok", ret);
    });
});

// 上下分
app.get('/update_coin', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    let coin = req.query.coin;
    db.update_coin(uuid, coin, (data) => {
        if (data) {
            http.send(res, 0, 'ok', {});
        } else {
            http.send(res, 1, 'handle error', {})
        }
    })
});

// 设置社团管理员
app.get('/update_user_rank', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    //社区等级：1总团长，2总团协管员，3分团长，4分团协管员，5合伙人，6合伙人协管员，7会员玩家'
    let level = req.query.level;
    db.update_rank(uuid, level, (data) => {
        if (data) {
            http.send(res, 0, 'ok', {});
        } else {
            http.send(res, 1, 'handle error', {})
        }
    })
});
// 加入社团
app.get('/join_org', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    let parent_id = req.query.parent_id || 0; // 邀请人id
    let org_id = req.query.org_id;  // 社团id

    db.join_org(uuid, org_id, parent_id, (data) => {
        if (data) {
            http.send(res, 0, 'ok', {});
        } else {
            http.send(res, 1, 'handle error', {})
        }
    })
});
// 获取入团申请列表
app.get('/join_org_list', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    db.join_org_list(org_id, (data) => {
        if (data) {
            http.send(res, 0, 'ok', { data: data });
        } else {
            http.send(res, 1, 'handle error', {})
        }
    })
});

// 审批入团申请请求
app.get('/join_org_approval', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let uuid = req.query.uuid;
    let state = req.query.state; //用户状态：1正常，2待审核, 3拒绝
    db.join_org_approval(org_id, uuid, state, (data) => {
        if (data) {
            http.send(res, 0, 'ok', { data: data });
        } else {
            http.send(res, 1, 'handle error', {})
        }
    })
});

// 获取社团配置信息(社团配置信息，公告数据）
app.get('/org_get_info', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    db.get_org_info(org_id, (data) => {
        if (data) {
            http.send(res, 0, 'ok', { data: data });
        } else {
            http.send(res, 1, 'server error', {})
        }
    })
});

// 设置公告
app.get('/org_set_notice', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let notice = req.query.notice;
    db.set_org_notice(org_id, notice, (data) => {
        http.send(res, 0, 'ok', {});
    })
});

// 设置社团玩法
app.get('/org_set_config', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let func_type_1 = req.query.func_type_1;//再来一局功能 0未启用 1启用
    let func_type_2 = req.query.func_type_2;//禁止团员语音聊天：0未启用 1启用
    let show_type = req.query.show_type; //游戏桌显示：1显示全部，2显示已开始，2显示未开始
    let pump = req.query.pump; //总抽水比例
    db.set_org_info(org_id, func_type_1, func_type_2, show_type, pump, (data) => {
        http.send(res, 0, 'ok', {});
    })
});

// 创建社团
app.get('/org_create', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let name = req.query.name;
    let uuid = req.query.uuid;
    db.org_create(name,uuid, (data) => {
        if (data == null) {
            return http.send(res, 1, 'server error', {})
        }
        http.send(res, 0, 'ok', { data: data });
    })
});

// 查询我的社团
app.get('/org_self', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    db.org_self(uuid, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

// 查询社团成员
app.get('/org_user_list', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let uuid = req.query.uuid;
    let type = req.query.type || 1; // 1所有玩家，2未绑定玩家
    db.org_user_list(org_id, uuid, type, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

// 解散社团
app.get('/org_delete', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    db.org_delete(org_id, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

// 可设定分团长积分抽成比例（百分比）(只能给自己的下线设置，总团长只能设置分团长）
app.get('/org_pump_config', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let uuid = req.query.uuid;
    let water = req.query.water; //比例
    db.org_pump_config(org_id,uuid,water, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

// 可设定进入社团无绑定玩家为直系上下分会员（便于玩家游戏房费抽成积分归属）总团长可以设置指定的上下关系其他的只能设置为自己的
app.get('/org_parent_config', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let uuid = req.query.uuid;  //下级uuid
    let parent_id = req.query.parent_id; // 上级uuid
    db.org_parent_config(org_id,uuid,water,parent_id, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

// 解散房间

// 查询房间
app.get('/org_get_room_list', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    db.get_room_list(org_id,uuid,water,parent_id, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

exports.start = function ($config) {
    config = $config;
    app.listen(config.CLIENT_PORT);
    console.log("client service is listening on port " + config.CLIENT_PORT);
};

