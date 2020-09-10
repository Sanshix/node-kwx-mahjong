var crypto = require('../utils/crypto');
var express = require('express');
var domain = require('domain');
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

app.use(function (req, res, next) {
    var reqDomain = domain.create();
    reqDomain.on('error', function (err) { // 下面抛出的异常在这里被捕获
        console.log(err.message);
        err.message = '服务器异常';
        next(err, req, res, next);
    });
    //console.log(req.url);
    reqDomain.run(next);
});
process.on('uncaughtException', function (err) {
    console.log('Error: ' + err.stack);
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
            real_name: data.real_name,
            id_card: data.id_card,
            headimg: data.headimg,
            mobile: data.mobile,
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
    var coins = config.DEFAULT_USER_COINS;
    var gems = config.DEFAULT_USER_GEMS;

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
    //console.log(conf);
    let json_conf = JSON.parse(conf);
    conf = JSON.stringify(json_conf);
    var org_id = json_conf.org_id || 0;
    db.get_user_data(account, async function (data) {
        if (null == data) {
            http.send(res, 1, "system error");
            return;
        }
        let boss_gems = await db.async_org_boos_gems(org_id);
        if (boss_gems < 30) {
            http.send(res, 1, "房卡不足30张");
            console.log(boss_gems, '团长房卡不足30张')
            return;
        }
        var userId = data.userid;
        var name = data.name;
        db.get_room_id_of_user(userId, async function (roomId) {
            if (roomId != null) {
                http.send(res, -1, "user is playing in room now.");
                return;
            }
            console.log(account, userId, conf, org_id);
            if (org_id != 0) {
                // return http.send(res, 0, "ok", { roomid: roomId });
                data.coins = await db.get_org_score(org_id, data.userid);
                let conditionCoin = room_service.switchPump(json_conf.maima, json_conf.baseScore);
                console.log(`${data.userid} : 我的积分：${data.coins}, 限制积分：${conditionCoin}`)
                if (data.coins < conditionCoin) {
                    return http.send(res, 1, `积分不足! 该房间限制积分大于等于${conditionCoin}`);
                }
            }
            room_service.createRoom(account, userId, conf, org_id, async function (err, roomId) {
                if (err == 0 && roomId != null) {
                    room_service.enterRoom(userId, name, data.coins, roomId, function (errcode, enterInfo) {
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
                    console.log(err, roomId)
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
        // if (data.roomid != null){
        //     return http.send(res,-1,"user is playing in room now.");
        // }
        db.get_room_data(roomId, async function (room) {
            if (!room) {
                return http.send(res, -1, "not find room");
            }
            if (room.org_id != 0) {
                //let user = await db.async_uuid_getUser(data.userid, room.org_id);
                // if (user.level == 1 || user.level == 3) {
                //     return http.send(res, -1, "团长或分团长无法加入游戏！");
                // }
                data.coins = await db.get_org_score(room.org_id, data.userid);
                let room_conf = JSON.parse(room.base_info);
                let conditionCoin = room_service.switchPump(room_conf.maima, room_conf.baseScore);
                console.log(`我的积分：${data.coins}, 限制积分：${conditionCoin}`)
                if (!data.roomid && data.coins < conditionCoin) {
                    return http.send(res, -1, `积分不足! 该房间限制积分大于等于${conditionCoin}`);
                }
            }
            var userId = data.userid;
            var name = data.name;
            room_service.enterRoom(userId, name, data.coins, roomId, function (errcode, enterInfo) {
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
                    http.send(res, errcode, "room can't enter.");
                }
            });
        })
    });
});

// 强制解散房间
app.get('/org_get_room_delet', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let room_id = req.query.room_id;
    room_service.dissolveRoom(room_id, (cal_rs) => {
        console.log('强制解散房间', cal_rs);
        //db.delete_room(room_id);
        http.send(res, 0, 'ok', {});
    })
});

app.get('/get_history_list', function (req, res) {
    var data = req.query;
    if (!check_account(req, res)) {
        return;
    }

    var account = data.account;
    let uuid = data.uuid;
    if (uuid) {
        db.get_user_history(userId, function (history) {
            http.send(res, 0, "ok", { history: history });
        });
    } else {
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
    }
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
        // console.log(data);
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
app.get('/update_coin', async function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    let coin = parseInt(req.query.coin);
    let org_id = req.query.org_id;
    // 验证
    let user = await db.async_uuid_getUser(uuid, org_id);
    if (!user) {
        return http.send(res, 1, '上分账户异常!', {})
    }
    if ((user.score + coin) < 0) {
        return http.send(res, 1, '积分余额不能小于0', {})
    }
    let parent_user = await db.async_account_getUser(req.query.account, org_id);
    if (user.parent_uuid != parent_user.uuid && parent_user.level != 1) {
        return http.send(res, 1, '没有操作权限', {})
    }
    //`level`  '社区等级：1总团长，2总团协管员，3分团长，4分团协管员，5合伙人，6合伙人协管员，7会员玩家',
    switch (parent_user.level) {
        case 7:
            return http.send(res, 1, '当前账号无此操作权限', {});
            break;
        case 3: case 5:
            if (parent_user.score < coin) {
                return http.send(res, 1, '积分不足', {})
            }
            break;
        case 4: case 6:
            parent_user = await db.async_uuid_getUser(user.parent_uuid, org_id);
            if (parent_user.score < coin) {
                return http.send(res, 1, '积分不足', {})
            }
            break;
    }
    db.update_coin(uuid, coin, org_id, async (data) => {
        if (!data) {
            return http.send(res, 1, 'handle error1', {});
        }
        db.update_coin_log(parent_user.userid, uuid, coin, org_id);
        if (parent_user.level == 1 || parent_user.level == 2) {
            let result = await db.async_get_user(uuid, org_id);
            return http.send(res, 0, 'ok', { result });
        }
        db.update_coin(parent_user.userid, -coin, org_id, async (data) => {
            if (!data) {
                return http.send(res, 1, 'handle error2', {});
            }
            let result = await db.async_get_user(uuid, org_id);
            http.send(res, 0, 'ok', { result });
        })
    })

});

// 设置社团管理员
app.get('/update_user_rank', async function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    //社区等级：1总团长，2总团协管员，3分团长，4分团协管员，5合伙人，6合伙人协管员，7会员玩家'
    let level = req.query.level;
    let to_uuid = req.query.to_uuid;
    let org_id = req.query.org_id;
    let validator = await db.org_duibi_dengji(org_id, uuid, to_uuid);
    if (!validator || level == 1) {
        return http.send(res, 1, '权限不足', {});
    }
    db.update_rank(to_uuid, uuid, level, org_id, (data) => {
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
    db.join_org_find(uuid, org_id, parent_id, (elem) => {
        if (elem) {
            return http.send(res, 1, '请勿重复申请', {});
        }
        db.join_org(uuid, org_id, parent_id, (data) => {
            if (data) {
                http.send(res, 0, 'ok', {});
            } else {
                http.send(res, 1, 'handle error', {})
            }
        })
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
            for (const key in data) {
                data[key].name = crypto.fromBase64(data[key].name);
            }
            http.send(res, 0, 'ok', { data: data });
        } else {
            http.send(res, 1, '操作失败', {})
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
            http.send(res, 1, '操作失败', {})
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
        if (data && data.length) {
            data[0].difen = 10;
            let conf = JSON.parse(data[0].room_config);
            if (conf && conf.length) {
                let difen = parseInt(conf[0].difen) ? parseInt(conf[0].difen) : 0;
                data[0].difen = difen;
            }
            http.send(res, 0, 'ok', { data: data });
        } else {
            http.send(res, 1, '该社团不存在', {})
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
    let pump = req.query.pump; //AA
    let difen = req.query.difen || 5; //低分
    let room_conf = req.query.conf;
    console.log(room_conf,pump);
    let json_room_conf = Object.keys(room_conf).length > 0 ? JSON.parse(room_conf) : false;
    db.get_org_info(org_id, (data) => {
        let data_conf = [];
        if (data[0].room_config) {
            data_conf = JSON.parse(data[0].room_config);
        }
        if (json_room_conf && json_room_conf.type) {
            json_room_conf.difen = parseInt(difen);
            json_room_conf.pump = parseInt(pump);
            data_conf.push(json_room_conf)
            // if (data_conf.length > 5) {
            //     data_conf.shift();
            // }
        }
        for (let i = 0; i < data_conf.length; i++) {
            data_conf[i].id = i + 1;
            //data_conf[i].difen = parseInt(difen);
        }
        db.set_org_info(org_id, func_type_1, func_type_2, show_type, pump, JSON.stringify(data_conf), (data) => {
            http.send(res, 0, 'ok', {});
        })
    })

});

// 删除社团玩法
app.get('/org_del_config', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let conf_id = req.query.conf_id;
    db.get_org_info(org_id, (data) => {
        let data_conf = [];
        if (data[0].room_config) {
            data_conf = JSON.parse(data[0].room_config);
        }
        for (let i = 0; i < data_conf.length; i++) {
            if (data_conf[i].id == conf_id) {
                data_conf.splice(i, 1);
                break;
            }
        }
        db.set_org_conf(org_id, JSON.stringify(data_conf), (zxc) => {
            http.send(res, 0, 'ok', {});
        })
    })

});

// 创建社团
app.get('/org_create', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let name = req.query.name;
    let uuid = req.query.uuid;
    db.org_create(name, uuid, (data) => {
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
        for (const key in data) {
            if (data[key].room_config) {
                data[key].room_config = JSON.parse(data[key].room_config);
            } else {
                data[key].room_config = [];
            }
        }
        http.send(res, 0, 'ok', { data: data });
    })
});

// 查询社团成员
app.get('/org_user_list', async function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let uuid = req.query.uuid;
    let type = req.query.type || 1; // 1所有玩家，2未绑定玩家
    let user = await db.async_account_getUser(req.query.account, org_id);
    if (!user) {
        return http.send(res, 1, '账号异常!', {})
    }
    db.org_user_list(org_id, uuid, type, user, async (data) => {
        for (const key in data) {
            data[key].name = crypto.fromBase64(data[key].name);
        }
        let superior = [];
        if (uuid) {
            superior = await db.get_org_superior(org_id, uuid);
        }
        http.send(res, 0, 'ok', { data, superior: superior });
    })
});

// 解散社团
app.get('/org_delete', async function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let validator = await db.async_get_user(req.query.uuid, req.query.org_id)
    if (!validator || validator.level != 1) {
        return http.send(res, 1, '操作失败', {});
    }
    let org_id = req.query.org_id;
    db.org_delete(org_id, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

// 退出社团
app.get('/org_quit', async function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let uuid = req.query.uuid;
    db.org_quit(org_id, uuid, (data) => {
        http.send(res, 0, 'ok', {});
    })
});


// 可设定分团长积分抽成比例（百分比）(只能给自己的下线设置，总团长只能设置分团长）
app.get('/org_pump_config', async function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let uuid = req.query.uuid;
    let parent_id = req.query.parent_id;
    let water = parseInt(req.query.value);
    let validator = await db.org_duibi_dengji(org_id, parent_id, uuid);
    if (!validator) {
        return http.send(res, 1, '权限不足', {});
    }
    //console.log(org_id,uuid,parent_uuid,value);
    if (water < 0 || water > 100) {
        return http.send(res, 1, '操作异常', {});
    }
    let parent_user = await db.async_uuid_getUser(parent_id, org_id);
    if (!parent_user) {
        return http.send(res, 1, '账号异常!', {})
    }
    if (parent_user.level == 1 && water > 100) {
        return http.send(res, 1, '比例数值不能高于100', {});
    }
    if (water > parent_user.water_ratio && parent_user.level != 1) {
        return http.send(res, 1, '比例数值不能高于自己', {});
    }
    db.org_pump_config(org_id, uuid, water, (data) => {
        http.send(res, 0, 'ok', {});
    })
});


// 可设定进入社团无绑定玩家为直系上下分会员（便于玩家游戏房费抽成积分归属）总团长可以设置指定的上下关系其他的只能设置为自己的
app.get('/org_parent_config', async function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    let uuid = req.query.uuid;  //下级uuid
    let parent_id = req.query.parent_id; // 上级uuid

    let validator = await db.org_duibi_dengji(org_id, parent_id, uuid);
    if (!validator) {
        return http.send(res, 1, '权限不足', {});
    }

    db.org_parent_config(org_id, uuid, parent_id, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

// 查询房间
app.get('/org_get_room_list', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let org_id = req.query.org_id;
    db.get_room_list(org_id, (data) => {
        for (const key in data) {
            data[key]['base_info'] = JSON.parse(data[key]['base_info']);
        }
        if (data.length > 0){
            data.sort(function (a, b) {
                let a_people = a.base_info.people;
                if (a_people == 2) {
                    a_people = a.user_id1 != 0 ? 2 : 1
                }else if (a_people ==3){
                    a_people = a.user_id2 != 0 ? 2 : 1
                }
                let b_people = b.base_info.people;
                if (b_people == 2) {
                    b_people = b.user_id1 != 0 ? 2 : 1
                }else if (b_people ==3){
                    b_people = b.user_id2 != 0 ? 2 : 1
                }
                return a_people - b_people
            })
        }
        http.send(res, 0, 'ok', { data: data });
    })
});

// 查询指定房间
app.get('/org_get_room_id', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let roomid = req.query.roomid;

    db.get_room_uuid(roomid, (data) => {
        http.send(res, 0, 'ok', { data: data });
    })
});

// 实名认证
app.get('/authentication', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    let name = req.query.name;
    let id_card = req.query.id_card;
    if (name == '' || id_card == '') {
        return http.send(res, 1, "参数异常");
    }
    db.authentication(uuid, name, id_card, (data) => {
        http.send(res, 0, 'ok', {});
    })
});

// 绑定手机号
app.get('/bind_mobile', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    let mobile = req.query.mobile;
    if (!mobile) {
        return http.send(res, 1, "参数异常");
    }
    db.bind_mobile(uuid, mobile, (data) => {
        http.send(res, 0, 'ok', {});
    })
});

// 提取奖励
app.get('/receive_goods', async function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    let org_id = req.query.org_id;
    let user = await db.async_uuid_getUser(uuid, org_id);
    if (!user || user.level == 7) {
        return http.send(res, 1, '操作异常!', {})
    }
    db.conversion_goal(uuid, org_id, (data) => {
        http.send(res, 0, 'ok', {});
    })
});

// 上下分日志
app.get('/update_coins_log', function (req, res) {
    if (!check_account(req, res)) {
        return;
    }
    let uuid = req.query.uuid;
    let org_id = req.query.org_id;
    let page = req.query.page_num || 0;
    db.find_coin_log(uuid, org_id, page, (data) => {
        if (data) {
            http.send(res, 0, 'ok', { data });
        } else {
            http.send(res, 1, 'handle error', {})
        }
    })
});

// app.use(function (err, req, res, next) {
//     //res.status(err.status || 500);
//     console.error(err, err.message);
//     return http.send(res, 1, 'server error', {})
// });

exports.start = function ($config) {
    config = $config;
    let server = app.listen(9001);
    server.setTimeout(0)
    console.log("client service is listening on port " + config.CLIENT_PORT);
};

