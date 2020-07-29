var crypto = require('../utils/crypto');
var express = require('express');
var db = require('../utils/db');
var http = require('../utils/http');
var roomMgr = require("../majiang_server/roommgr");

var app = express();

var hallIp = null;
var config = null;
var rooms = {};
var serverMap = {};
var roomIdOfUsers = {};

app.all('*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
    res.header("X-Powered-By", ' 3.2.1');
    res.header("Content-Type", "application/json;charset=utf-8");
    next();
});

app.get('/register_gs', function (req, res) {
    var ip = req.ip;
    var clientip = req.query.clientip;
    var clientport = req.query.clientport;
    var httpPort = req.query.httpPort;
    var load = req.query.load;
    var id = clientip + ":" + clientport;
    var info = serverMap[id];

    if (info != null) {
        if (info.clientport != clientport ||
            info.httpPort != httpPort ||
            info.ip != ip) {
            console.log("duplicate gsid:" + id + ",addr:" + ip + "(" + httpPort + ")");
            http.send(res, 1, "duplicate gsid:" + id);
            return;
        }

        info.load = load;
        http.send(res, 0, "ok", {ip: ip});
        return;
    }

    serverMap[id] = {
        ip: ip,
        id: id,
        clientip: clientip,
        clientport: clientport,
        httpPort: httpPort,
        load: load
    };

    http.send(res, 0, "ok", {ip: ip});
    console.log("game server registered.\n\tid:" + id + "\n\taddr:" + ip + "\n\thttp port:" + httpPort + "\n\tsocket clientport:" + clientport);

    var reqdata = {
        serverid: id,
        sign: crypto.md5(id + config.ROOM_PRI_KEY)
    };

    //获取服务器信息
    http.get(ip, httpPort, "/get_server_info", reqdata, function (ret, data) {
        if (ret && data.errcode == 0) {
            for (var i = 0; i < data.userroominfo.length; i += 2) {
                var userId = data.userroominfo[i];
                var roomId = data.userroominfo[i + 1];
            }
        } else {
            console.log(data.errmsg);
        }
    });
});

function chooseServer() {
    var serverinfo = null;
    for (var s in serverMap) {
        var info = serverMap[s];
        if (serverinfo == null) {
            serverinfo = info;
        } else {
            if (serverinfo.load > info.load) {
                serverinfo = info;
            }
        }
    }

    return serverinfo;
}

exports.createRoom = function (account, userId, roomConf, org_id, fnCallback) {
    var serverinfo = chooseServer();
    if (serverinfo == null) {
        fnCallback(101, null);
        return;
    }

    db.get_gems(account, function (data) {
        if (data != null) {
            //2、请求创建房间
            var reqdata = {
                userid: userId,
                gems: data.gems,
                conf: roomConf,
                org_id: org_id
            };

            reqdata.sign = crypto.md5(userId + roomConf + data.gems + config.ROOM_PRI_KEY);
            http.get(serverinfo.ip, serverinfo.httpPort, "/create_room", reqdata, function (ret, data) {
                //console.log(data);
                if (ret) {
                    if (data.errcode == 0) {
                        fnCallback(0, data.roomid);
                    } else {
                        fnCallback(data.errcode, null);
                    }

                    return;
                }

                fnCallback(102, null);
            });
        } else {
            fnCallback(103, null);
        }
    });
};

exports.enterRoom = function (userId, name, coins, roomId, fnCallback) {
    var reqdata = {
        userid: userId,
        name: name,
        roomid: roomId,
        coins: coins
    };

    reqdata.sign = crypto.md5(userId + name + roomId + config.ROOM_PRI_KEY);

    var checkRoomIsRuning = function (serverinfo, roomId, callback) {
        var sign = crypto.md5(roomId + config.ROOM_PRI_KEY);
        var roominfo = {
            roomid: roomId,
            sign: sign
        };

        http.get(serverinfo.ip, serverinfo.httpPort, "/is_room_runing", roominfo, function (ret, data) {
            if (ret) {
                if (data.errcode == 0 && data.runing == true) {
                    callback(true);
                } else {
                    callback(false);
                }
            } else {
                callback(false);
            }
        });
    }

    var enterRoomReq = function (serverinfo) {
        http.get(serverinfo.ip, serverinfo.httpPort, "/enter_room", reqdata, function (ret, data) {
           // console.log(data);
            if (ret) {
                if (data.errcode == 0) {
                    db.set_room_id_of_user(userId, roomId, function (ret) {
                        fnCallback(0, {
                            ip: serverinfo.clientip,
                            port: serverinfo.clientport,
                            token: data.token
                        });
                    });
                } else {
                    console.log(data.errmsg);
                    fnCallback(data.errcode, null);
                }
            } else {
                fnCallback(-1, null);
            }
        });
    };

    var chooseServerAndEnter = function (serverinfo) {
        serverinfo = chooseServer();
        if (serverinfo != null) {
            enterRoomReq(serverinfo);
        } else {
            fnCallback(-1, null);
        }
    }

    db.get_room_addr(roomId, function (ret, ip, port) {
        if (ret) {
            var id = ip + ":" + port;
            var serverinfo = serverMap[id];
            console.log(serverMap,id);
            if (serverinfo != null) {
                checkRoomIsRuning(serverinfo, roomId, function (isRuning) {
                    if (isRuning) {
                        enterRoomReq(serverinfo);
                    } else {
                        // TODO
                        chooseServerAndEnter(serverinfo);
                    }
                });
            } else {
                chooseServerAndEnter(serverinfo);
            }
        } else {
            fnCallback(-2, null);
        }
    });
};

exports.dissolveRoom = function (roomId, fnCallback) {
    var reqdata = {
        roomid: roomId
    };
    reqdata.sign = crypto.md5(roomId + config.ROOM_PRI_KEY);
    var dissolveRoomReq = function (serverinfo) {
        http.get(serverinfo.ip, serverinfo.httpPort, "/dissolve_room", reqdata, function (ret, data) {
            fnCallback('已解散');
        });
    };

    db.get_room_addr(roomId, function (ret, ip, port) {
        if (ret) {
            var id = ip + ":" + port;
           // var serverinfo = serverMap[id];
           var serverinfo = serverMap[0];
            if (serverinfo != null) {
                dissolveRoomReq(serverinfo);
            } else {
                fnCallback('空房间1');
                roomMgr.destroy(roomId)
            }
        } else {
            fnCallback('空房间2');
            roomMgr.destroy(roomId)
        }
    });
};

exports.isServerOnline = function (ip, port, callback) {
    var id = ip + ":" + port;
    var serverInfo = serverMap[id];
    if (!serverInfo) {
        callback(false);
        return;
    }

    var sign = crypto.md5(config.ROOM_PRI_KEY);
    http.get(serverInfo.ip, serverInfo.httpPort, "/ping", {sign: sign}, function (ret, data) {
        if (ret) {
            callback(true);
        } else {
            callback(false);
        }
    });
};

exports.switchPump = (maima, baseScore) => {
    // 1底分不买马50
    // 1底分买马：80
    // 2底分不买马：100
    // 2底分买马：140
    // 3底分不买马：120
    // 3底分买马：180
    // 4底分不买马：160
    // 4底分买马：220
    // 5底分不买马：200
    // 5底分买马：280
    // 6底分不买马：260
    // 6底分买马：320
    switch (baseScore) {
        case 1:
            if (!maima) {return 50} else {return 80}
            break;
        case 2:
            if (!maima) {return 100} else {return 140}
            break;
        case 3:
            if (!maima) {return 120} else {return 180}
            break;
        case 4:
            if (!maima) {return 160} else {return 220}
            break;
        case 5:
            if (!maima) {return 200} else {return 280}
            break;
        case 6:
            if (!maima) {return 260} else {return 320}
            break;
        default :
            if (!maima) {return 50} else {return 80}
            break;
    }
}

exports.start = function ($config) {
    config = $config;
    app.listen(config.ROOM_PORT, config.FOR_ROOM_IP);
    console.log("room service is listening on " + config.FOR_ROOM_IP + ":" + config.ROOM_PORT);
};

