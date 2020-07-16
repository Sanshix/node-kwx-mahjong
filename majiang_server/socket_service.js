
var crypto = require('../utils/crypto');
var db = require('../utils/db');

var tokenMgr = require('./tokenmgr');
var roomMgr = require('./roommgr');
var userMgr = require('./usermgr');

var io = null;

exports.start = function(config, mgr) {
	io = require('socket.io')(config.CLIENT_PORT);

	io.sockets.on('connection', function(socket) {
		socket.on('login', function(data) {
			data = JSON.parse(data);
			if (socket.userId != null) {
				//已经登陆过的就忽略
				return;
			}

			var token = data.token;
			var roomId = data.roomid;
			var time = data.time;
			var sign = data.sign;

			console.log(roomId);
			console.log(token);
			console.log(time);
			console.log(sign);

			//检查参数合法性
			if (token == null || roomId == null || sign == null || time == null) {
				console.log('invalid param');
				socket.emit('login_result', { errcode: 1, errmsg: "invalid parameters" });
				return;
			}

			//检查参数是否被篡改
			var md5 = crypto.md5(roomId + token + time + config.ROOM_PRI_KEY);
			if (md5 != sign) {
				console.log('invalid sign');
				socket.emit('login_result', { errcode: 2, errmsg: "login failed. invalid sign!"});
				return;
			}

			//检查token是否有效
			if (!tokenMgr.isTokenValid(token)) {
				console.log('invalid token');
				socket.emit('login_result',{ errcode: 3, errmsg: "token out of time."});
				return;
			}

			//检查房间合法性
			var userId = tokenMgr.getUserID(token);
			var roomId = roomMgr.getUserRoom(userId);

			userMgr.bind(userId, socket);
			socket.userId = userId;

			//返回房间信息
			var roomInfo = roomMgr.getRoom(roomId);

			var seatIndex = roomMgr.getUserSeatId(userId);

			roomInfo.seats[seatIndex].ip = socket.handshake.address;

			var userData = null;
			var seats = [];
			console.log('ROOM CONF：',roomInfo.conf);
			for (var i = 0; i < roomInfo.seats.length; ++i) {
				var rs = roomInfo.seats[i];
				var uid = rs.userId;
				var online = false;
				if (uid > 0) {
					online = userMgr.isOnline(uid);
				}
				//限制ip
				if (roominfo.conf.ipForbid == true && i != seatIndex){
					if (roomInfo.seats[seatIndex].ip == rs.ip){
						console.log('ip重复');
						socket.emit('login_result',{ errcode: 4, errmsg: "该房间禁止同IP用户游玩"});
						return;
					}
				}
				var seat = {
					userid: uid,
					ip: rs.ip,
					score: rs.score,
					name: rs.name,
					online: online,
					ready: rs.ready,
					dingpiao: rs.dingpiao,
					seatindex: i
				};

				seats.push(seat);

				if (userId == uid) {
					userData = seat;
				}
			}

			//通知前端
			var ret = {
				errcode: 0,
				errmsg: "ok",
				data: {
					roomid: roomInfo.id,
					conf: roomInfo.conf,
					numofgames: roomInfo.numOfGames,
					seats: seats,
					numofseats: roomInfo.numOfSeats,
				}
			};

			socket.emit('login_result', ret);
			//通知其它客户端
			userMgr.broacastInRoom('new_user_comes_push', userData, userId, false);

			var gameMgr = roomInfo.gameMgr;

			socket.gameMgr = gameMgr;

			//玩家上线，强制设置为TRUE
			//if (!roomMgr.needDingPiao(userId)) {
			//	gameMgr.setReady(userId);
			//}

			socket.emit('login_finished');

			var ret = socket.gameMgr.dissolveUpdate(roomId, userId, true);
			if (ret != null) {
				var dr = ret.dr;

				if (dr != null) {
					var ramaingTime = (dr.endTime - Date.now()) / 1000;
					var data = {
						time: ramaingTime,
						states: dr.states,
						online: dr.online,
						reason: dr.reason,
					}

					userMgr.broacastInRoom('dissolve_notice_push', data, userId, true);
				} else {
					var reject = roomInfo.rejectUser;
					var data = {};
					if (reject != null) {
						data.reject = reject;
						userMgr.broacastInRoom('dissolve_cancel_push', data, userId, true);
					} else {
						userMgr.broacastInRoom('dissolve_cancel_push', data, userId, false);
					}

					roomInfo.rejectUser = null;
				}
			}
		});

		socket.on('ready', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			userMgr.broacastInRoom('user_ready_push', { userid: uid, ready: true }, uid, true);
			socket.gameMgr.setReady(uid);
		});

		socket.on('dingpiao', function(data) {
			var uid = socket.userId;
			if (uid == null || data == null) {
				return;
			}

			var piao = 0;
			if (typeof(data) == "number"){
				piao = data;
			} else if (typeof(data) == "string") {
				piao = parseInt(data);
			} else {
				console.log("dingpiao: invalid param");
				return;
			}


			roomMgr.setDingPiao(uid, piao);
			userMgr.broacastInRoom('user_dingpiao_push', { userid: uid, dingpiao: piao }, uid, true);

			socket.gameMgr.setReady(uid);
			userMgr.broacastInRoom('user_ready_push', { userid: uid, ready: true }, uid, true);
		});

		// reserved for scmj
		socket.on('huanpai',function(data) {
			var uid = socket.userId;
			if (uid == null || data == null) {
				return;
			}

			if (typeof(data) == "string") {
				data = JSON.parse(data);
			}

			var p1 = data.p1;
			var p2 = data.p2;
			var p3 = data.p3;
			if (p1 == null || p2 == null || p3 == null) {
				console.log("huanpai: invalid data");
				return;
			}

			socket.gameMgr.huanSanZhang(uid, p1, p2, p3);
		});

		//reserved for scmj
		socket.on('dingque', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			socket.gameMgr.dingQue(uid, data);
		});

		socket.on('chupai', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			socket.gameMgr.chuPai(uid, data);
		});

		socket.on('peng', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			socket.gameMgr.peng(uid);
		});

		socket.on('gang',function(data) {
			var uid = socket.userId;
			if (uid == null || data == null) {
				return;
			}

			var pai = -1;
			if (typeof(data) == "number"){
				pai = data;
			} else if (typeof(data) == "string") {
				pai = parseInt(data);
			} else {
				console.log("gang:invalid param");
				return;
			}

			socket.gameMgr.gang(uid, pai);
		});

		socket.on('hu', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			socket.gameMgr.hu(uid);
		});

		socket.on('guo', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			socket.gameMgr.guo(uid);
		});

		socket.on('ming', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			if (typeof(data) == "string") {
				data = JSON.parse(data);
			}

			socket.gameMgr.ming(uid, data);
		});

		socket.on('chat', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			userMgr.broacastInRoom('chat_push', { sender: uid, content: data }, uid, true);
		});

		socket.on('quick_chat', function(data){
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			userMgr.broacastInRoom('quick_chat_push',{ sender: uid, content:data }, uid, true);
		});

		socket.on('voice_msg', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			userMgr.broacastInRoom('voice_msg_push', { sender: uid, content: data }, uid, true);
		});

		socket.on('emoji', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			userMgr.broacastInRoom('emoji_push', { sender: uid, content: data }, uid, true);
		});

		socket.on('exit', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			var roomId = roomMgr.getUserRoom(uid);
			if (roomId == null) {
				return;
			}

			//如果游戏已经开始，则不可以
			if (socket.gameMgr && socket.gameMgr.hasBegan(roomId)) {
				return;
			}

			//如果是房主，则只能走解散房间
			if (roomMgr.isCreator(uid)) {
				return;
			}

			//通知其它玩家，有人退出了房间
			userMgr.broacastInRoom('exit_notify_push', uid, uid, false);

			roomMgr.exitRoom(uid);
			userMgr.del(uid);

			socket.emit('exit_result');
			socket.disconnect();
		});

		socket.on('dispress', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			var roomId = roomMgr.getUserRoom(uid);
			if (roomId == null) {
				return;
			}

			//如果游戏已经开始，则不可以
			if (socket.gameMgr.hasBegan(roomId)) {
				return;
			}
			// TODO 强制解散
			//如果不是房主，则不能解散房间
			if (!roomMgr.isCreator(roomId, uid)) {
				return;
			}

			userMgr.broacastInRoom('dispress_push', {}, uid, true);
			userMgr.kickAllInRoom(roomId);
			roomMgr.destroy(roomId);
			socket.disconnect();
		});

		socket.on('dissolve_request', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			var roomId = roomMgr.getUserRoom(uid);
			if (roomId == null) {
				return;
			}

			//如果游戏未开始，则不可以
			if (!socket.gameMgr.hasBegan(roomId)) {
				return;
			}

			var ret = socket.gameMgr.dissolveRequest(roomId, uid);
			if (ret != null) {
				var dr = ret.dr;
				var ramaingTime = (dr.endTime - Date.now()) / 1000;
				var data = {
					time: ramaingTime,
					states: dr.states,
					online: dr.online,
					reason: dr.reason,
				}

				userMgr.broacastInRoom('dissolve_notice_push', data, uid, true);
			}
		});

		socket.on('dissolve_agree', function(data){
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			var roomId = roomMgr.getUserRoom(uid);
			if (roomId == null) {
				return;
			}

			var roomInfo = roomMgr.getRoom(roomId);
			if (roomInfo == null) {
				return;
			}

			var ret = socket.gameMgr.dissolveAgree(roomId, uid, true);
			if (ret != null) {
				var dr = ret.dr;
				var ramaingTime = (dr.endTime - Date.now()) / 1000;
				var data = {
					time: ramaingTime,
					states: dr.states,
					online: dr.online,
					reason: dr.reason,
				}

				userMgr.broacastInRoom('dissolve_notice_push', data, uid, true);

				var doAllAgree = true;
				for (var i = 0; i < dr.states.length; ++i) {
					if (!dr.states[i]) {
						doAllAgree = false;
						break;
					}
				}

				if (doAllAgree) {
					userMgr.broacastInRoom('dissolve_done_push', {}, uid, true);
					roomInfo.dissolveDone = true;
					socket.gameMgr.doDissolve(roomId);
				}
			}
		});

		socket.on('dissolve_reject', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			var roomId = roomMgr.getUserRoom(uid);
			if (roomId == null) {
				return;
			}

			var ret = socket.gameMgr.dissolveAgree(roomId, uid, false);
			if (ret != null) {
				var dr = ret.dr;

				if (dr) {
					var ramaingTime = (dr.endTime - Date.now()) / 1000;
					var data = {
						time: ramaingTime,
						states: dr.states,
						online: dr.online,
						reason: dr.reason,
					}

					userMgr.broacastInRoom('dissolve_notice_push', data, uid, true);
				} else {
					userMgr.broacastInRoom('dissolve_cancel_push', { reject: uid }, uid, true);
				}
			}
		});

		socket.on('disconnect', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			var data = {
				userid: uid,
				online: false
			};

			//通知房间内其它玩家
			userMgr.broacastInRoom('user_state_push', data, uid, false);

			//清除玩家的在线信息
			userMgr.del(uid);
			socket.userId = null;

			console.log('user disconnec: ' + uid);

			var roomId = roomMgr.getUserRoom(uid);
			if (roomId == null) {
				return;
			}

			if (!socket.gameMgr.hasBegan(roomId)) {
				return;
			}

			var roomInfo = roomMgr.getRoom(roomId);
			if (roomInfo.dissolveDone || roomInfo.end) {
				return;
			}

			var ret = socket.gameMgr.dissolveUpdate(roomId, uid, false);
			if (ret != null) {
				var dr = ret.dr;
				var ramaingTime = (dr.endTime - Date.now()) / 1000;
				var data = {
					time: ramaingTime,
					states: dr.states,
					online: dr.online,
					reason: dr.reason,
				}

				userMgr.broacastInRoom('dissolve_notice_push', data, uid, false);
			}
		});

		socket.on('game_ping', function(data) {
			var uid = socket.userId;
			if (uid == null) {
				return;
			}

			socket.emit('game_pong');
		});
	});

	console.log("game server is listening on " + config.CLIENT_PORT);	
};

