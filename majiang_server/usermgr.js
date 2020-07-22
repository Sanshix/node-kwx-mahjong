
var roomMgr = require('./roommgr');
var userList = {};
var userOnline = 0;

exports.bind = function(userId, socket) {
	userList[userId] = socket;
	userOnline++;
};

exports.del = function(userId) {
	delete userList[userId];
	userOnline--;
};

exports.get = function(userId) {
	return userList[userId];
};

exports.isOnline = function(userId) {
	var data = userList[userId];
	if (data != null) {
		return true;
	}

	return false;
};

exports.getOnlineCount = function() {
	return userOnline;
}

exports.sendMsg = function(userId, event, msgdata) {
	//console.log(userId + ' ' + event);
	var socket = userList[userId];
	if (socket) {
		socket.emit(event, msgdata);
	}
};

exports.kickAllInRoom = function(roomId) {
	if (roomId == null) {
		return;
	}

	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return;
	}

	for (var i = 0; i < roomInfo.seats.length; ++i) {
		var rs = roomInfo.seats[i];
		var uid = rs.userId;

		//如果不需要发给发送方，则跳过
		if (uid > 0) {
			var socket = userList[uid];
			if (socket) {
				exports.del(uid);
				socket.disconnect();
			}
		}
	}
};

exports.broacastInRoom = function(event, data, sender, includingSender) {
	var roomId = roomMgr.getUserRoom(sender);
	if (roomId == null) {
		return;
	}

	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return;
	}

	for (var i = 0; i < roomInfo.seats.length; ++i) {
		var rs = roomInfo.seats[i];
		var uid = rs.userId;

		//如果不需要发给发送方，则跳过
		if (uid == sender && !includingSender) {
			continue;
		}

		var socket = userList[uid];
		if (socket != null) {
			socket.emit(event, data);
			//console.log('send to ' + uid + ': ' + event);
		}
	}
};

exports.broacastAllInRoom = function(event, data, roomId) {
	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return;
	}
	for (var i = 0; i < roomInfo.seats.length; ++i) {
		var rs = roomInfo.seats[i];
		var uid = rs.userId;
		var socket = userList[uid];
		if (socket != null) {
			socket.emit(event, data);
			//console.log('send to ' + uid + ': ' + event);
		}
	}
};

