
var db = require('../utils/db');

var rooms = {};
var creatingRooms = {};

var userLocation = {};
var totalRooms = 0;

var DI_FEN = [1,2,5];
var MAX_FAN = [3,4,5];
var JU_SHU = [8, 16];
var JU_SHU_COST = [1,2];

var gamemgrs = {};

function getGameMgr(type) {
	var mgr = gamemgrs[type];

	if (mgr == null) {
		mgr = require('./gamemgr_' + type);
		gamemgrs[type] = mgr;
	}

	return mgr;
}

function generateRoomId() {
	var roomId = '';
	for (var i = 0; i < 6; ++i) {
		roomId += Math.floor(Math.random()*10);
	}

	return roomId;
}

function constructRoomFromDb(dbdata) {
	var roomInfo = {
		uuid: dbdata.uuid,
		id: dbdata.id,
		numOfGames: dbdata.num_of_turns,
		createTime: dbdata.create_time,
		nextButton: dbdata.next_button,
		//seats: new Array(4),
		conf: JSON.parse(dbdata.base_info)
	};

	var gameMgr = getGameMgr('kwx');
	if (!gameMgr) {
		console.log('get game mgr fail');
		return null;
	}

	//var nSeats = gameMgr.numOfSeats;
	var nSeats = dbdata.num_seats;
	roomInfo.gameMgr = gameMgr;
	roomInfo.seats = new Array(nSeats);
	roomInfo.numOfSeats = nSeats;

	var roomId = roomInfo.id;

	for (var i = 0; i < nSeats; ++i) {
		var s = roomInfo.seats[i] = {};
		s.userId = dbdata["user_id" + i];
		s.score = dbdata["user_score" + i];
		s.name = dbdata["user_name" + i];
		s.ready = false;
		s.seatIndex = i;
		s.numZiMo = 0;
		s.numJiePao = 0;
		s.numDianPao = 0;
		s.numAnGang = 0;
		s.numMingGang = 0;
		s.numChaJiao = 0;

		s.dingpiao = dbdata["user_dp" + i];

		if (s.userId > 0) {
			userLocation[s.userId] = {
				roomId: roomId,
				seatIndex: i
			};
		}
	}

	rooms[roomId] = roomInfo;
	totalRooms++;

	return roomInfo;
}

exports.createRoom = function(creator, roomConf, gems, org_id, ip,  port, callback) {
	var gameMgr = getGameMgr('kwx');
	if (null == gameMgr) {
		callback(1, null);
		console.log('get mgr fail');
		return;
	}

	if (!gameMgr.checkConf()) {
		console.log('check conf fail');
		callback(1, null);
		return;
	}

	var nSeats = roomConf.people || 3;

	if (roomConf.type == null ||
		roomConf.difen == null ||
		roomConf.maxfan == null ||
		roomConf.gamenum == null)
	{
		callback(1, null);
		return;
	}

	if (roomConf.difen < 0 || roomConf.difen > DI_FEN.length) {
		callback(1, null);
		return;
	}

	if (roomConf.maxfan < 0 || roomConf.maxfan > MAX_FAN.length) {
		callback(1, null);
		return;
	}

	if (roomConf.gamenum < 0 || roomConf.gamenum > JU_SHU.length) {
		callback(1, null);
		return;
	}
	
	var cost = JU_SHU_COST[roomConf.gamenum];
	if (cost > gems) {
		callback(2222, null);
		return;
	}

	var fnCreate = function() {
		var roomId = generateRoomId();
		if (rooms[roomId] != null || creatingRooms[roomId] != null) {
			fnCreate();
		} else {
			creatingRooms[roomId] = true;
			db.is_room_exist(roomId, async function(ret) {
				if (ret) {
					delete creatingRooms[roomId];
					fnCreate();
				} else {
					if (org_id != 0 ){
						creator = await db.get_boss_id(org_id);
					}
					var createTime = Math.ceil(Date.now()/1000);
					var roomInfo = {
						uuid: '',
						id: roomId,
						numOfGames: 0,
						createTime: createTime,
						nextButton: 0,
						seats: [],
						numOfSeats: nSeats,
						gameMgr: gameMgr,
						conf: {
							type: roomConf.type,
							creator: creator,
							baseScore: roomConf.baseScore,
							maxFan: MAX_FAN[roomConf.maxfan],
							maxGames: JU_SHU[roomConf.gamenum],
						},
						org_id : org_id
					};

					var conf = roomInfo.conf;

					gameMgr.parseConf(roomConf, conf)

					for (var i = 0; i < nSeats; ++i) {
						roomInfo.seats.push({
							userId: 0,
							score: 1000,
							name: '',
							ready: false,
							seatIndex: i,
							numZiMo: 0,
							numJiePao: 0,
							numDianPao: 0,
							numAnGang: 0,
							numMingGang: 0,
							numChaJiao: 0,
							dingpiao: -1,
						});
					}

					//写入数据库
					db.create_room(roomId, conf, org_id, ip, port, createTime, function(uuid) {
						delete creatingRooms[roomId];
						if (uuid != null) {
							roomInfo.uuid = uuid;
							console.log(uuid);
							rooms[roomId] = roomInfo;
							totalRooms++;
							callback(0, roomId);
						} else {
							callback(3, null);
						}
					});
				}
			});
		}
	}

	fnCreate();
	console.log('create done');
};

exports.destroy = function(roomId) {
	var roomInfo = rooms[roomId];
	if (roomInfo == null) {
		return;
	}

	var nSeats = roomInfo.numOfSeats;

	for (var i = 0; i < nSeats; ++i) {
		var userId = roomInfo.seats[i].userId;
		if (userId > 0) {
			delete userLocation[userId];
			db.set_room_id_of_user(userId, null);
		}
	}
	
	delete rooms[roomId];
	totalRooms--;
	db.delete_room(roomId);
}

exports.getTotalRooms = function() {
	return totalRooms;
}

exports.getRoom = function(roomId) {
	return rooms[roomId];
};

exports.isCreator = function(roomId, userId) {
	var roomInfo = rooms[roomId];
	if (roomInfo == null) {
		return false;
	}

	return roomInfo.conf.creator == userId;
};

exports.enterRoom = function(roomId, userId, userName,coins, callback) {
	var fnTakeSeat = function(room) {
		if (exports.getUserRoom(userId) == roomId) {
			return 0;
		}
		console.log('enterRoom_start',room);
		for (var i = 0; i < room.numOfSeats; ++i) {
			var seat = room.seats[i];
			if (seat.userId <= 0) {
				seat.userId = userId;
				seat.name = userName;
				userLocation[userId] = {
					roomId: roomId,
					seatIndex: i
				};
				if (room.org_id != 0){
					seat.score = parseInt(coins);
					console.log('coins:',coins);
				}
				console.log('enterRoom_end',room);
				// 更新coin
				db.update_seat_info(roomId, i, seat.userId, coins, seat.name);
				return 0;
			}
		}

		return 1;
	}

	var room = rooms[roomId];
	if (room) {
		var ret = fnTakeSeat(room);
		console.log('enterRoom_over',room);
		rooms[roomId] = room;
		callback(ret);
	} else {
		db.get_room_data(roomId, function(dbdata) {
			if (dbdata == null) {
				//找不到房间
				callback(2);
			} else {
				//construct room.
				room = constructRoomFromDb(dbdata);

				var ret = fnTakeSeat(room);
				callback(ret);
			}
		});
	}
};

function getSeat(uid) {
	var roomId = exports.getUserRoom(uid);
	if (roomId == null) {
		return null;
	}

	var room = exports.getRoom(roomId);
	if( room == null) {
		return null;
	}

	var seatIndex = exports.getUserSeatId(uid);
	if (seatIndex == null) {
		return null;
	}

	return room.seats[seatIndex];
}

exports.setReady = function(userId, value) {
	var s = getSeat(userId);
	if (s) {
		s.ready = value;
	}
}

exports.isReady = function(userId) {
	var s = getSeat(userId);
	if (s) {
		return s.ready;
	}

	return false;
}

exports.needDingPiao = function(uid) {
	var roomId = exports.getUserRoom(uid);
	if (roomId == null) {
		return false;
	}

	var room = exports.getRoom(roomId);
	if( room == null) {
		return false;
	}

	var seatIndex = exports.getUserSeatId(uid);
	if (seatIndex == null) {
		return false;
	}

	var seat = room.seats[seatIndex];

	if (!room.conf.dingpiao) {
		return false;
	}

	if (seat.dingpiao >= 0) {
		return false;
	}

	return true;
}

exports.setDingPiao = function(userId, value) {
	var s = getSeat(userId);
	if (s) {
		s.dingpiao = value;
	}
}

exports.getUserRoom = function(userId) {
	var location = userLocation[userId];
	if (location != null) {
		return location.roomId;
	}

	return null;
};

exports.getUserSeatId = function(userId) {
	var location = userLocation[userId];
	if (location != null) {
		return location.seatIndex;
	}

	return null;
};

exports.getUserLocations = function() {
	return userLocation;
};

exports.exitRoom = function(userId) {
	var location = userLocation[userId];
	if (location == null)
		return;

	var roomId = location.roomId;
	var seatIndex = location.seatIndex;
	var room = rooms[roomId];
	delete userLocation[userId];
	if (room == null || seatIndex == null) {
		return;
	}

	var seat = room.seats[seatIndex];
	seat.userId = 0;
	seat.name = '';

	var numOfPlayers = 0;
	for (var i = 0; i < room.numOfSeats; ++i) {
		if(room.seats[i].userId > 0) {
			numOfPlayers++;
		}
	}

	db.set_room_id_of_user(userId, null);

	if (numOfPlayers == 0) {
		exports.destroy(roomId);
	}
};

