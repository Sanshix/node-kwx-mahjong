
exports.checkTingPai = function(seatData, begin, end) {
	var holds = seatData.holds;

	for(var i = begin; i < end; ++i){
		//如果这牌已经在和了，就不用检查了
		if(seatData.tingMap[i] != null) {
			continue;
		}

		//将牌加入到计数中
		var old = seatData.countMap[i];
		if (old == null) {
			old = 0;
			seatData.countMap[i] = 1;
		} else {
			seatData.countMap[i] ++;		
		}

		seatData.holds.push(i);
		//逐个判定手上的牌
		var ret = checkCanHu(seatData);
		if (ret) {
			//平胡 0番
			seatData.tingMap[i] = {
				pattern: "normal",
				fan: 0,
			};
		}
		
		//搞完以后，撤消刚刚加的牌
		seatData.countMap[i] = old;
		seatData.holds.pop();
	}
}

var kanzi = [];
var record = false;

function debugRecord(pai) {
	if (record) {
		kanzi.push(pai);
	}
}

function matchSingle(seatData, selected) {
	if (selected >= 27) {
		return false;
	}

	//分开匹配 A-2,A-1,A
	var matched = true;
	var v = selected % 9;
	if (v < 2) {
		matched = false;
	} else {
		for (var i = 0; i < 3; ++i) {
			var t = selected - 2 + i;
			var cc = seatData.countMap[t];
			if (cc == null || cc == 0) {
				matched = false;
				break;
			}
		}
	}

	//匹配成功，扣除相应数值
	if (matched) {
		seatData.countMap[selected - 2] --;
		seatData.countMap[selected - 1] --;
		seatData.countMap[selected] --;
		var ret = checkSingle(seatData);
		seatData.countMap[selected - 2] ++;
		seatData.countMap[selected - 1] ++;
		seatData.countMap[selected] ++;
		if (ret) {
			debugRecord(selected - 2);
			debugRecord(selected - 1);
			debugRecord(selected);
			return true;
		}
	}

	//分开匹配 A-1,A,A + 1
	matched = true;
	if (v < 1 || v > 7) {
		matched = false;
	} else {
		for (var i = 0; i < 3; ++i) {
			var t = selected - 1 + i;
			var cc = seatData.countMap[t];
			if (cc == null || cc == 0) {
				matched = false;
				break;
			}
		}
	}

	//匹配成功，扣除相应数值
	if (matched) {
		seatData.countMap[selected - 1] --;
		seatData.countMap[selected] --;
		seatData.countMap[selected + 1] --;
		var ret = checkSingle(seatData);
		seatData.countMap[selected - 1] ++;
		seatData.countMap[selected] ++;
		seatData.countMap[selected + 1] ++;
		if (ret) {
			debugRecord(selected - 1);
			debugRecord(selected);
			debugRecord(selected + 1);
			return true;
		}
	}

	//分开匹配 A,A+1,A + 2
	matched = true;
	if (v > 6) {
		matched = false;
	} else {
		for (var i = 0; i < 3; ++i) {
			var t = selected + i;
			var cc = seatData.countMap[t];
			if (cc == null || cc == 0) {
				matched = false;
				break;
			}
		}
	}

	//匹配成功，扣除相应数值
	if (matched) {
		seatData.countMap[selected] --;
		seatData.countMap[selected + 1] --;
		seatData.countMap[selected + 2] --;
		var ret = checkSingle(seatData);
		seatData.countMap[selected] ++;
		seatData.countMap[selected + 1] ++;
		seatData.countMap[selected + 2] ++;
		if (ret) {
			debugRecord(selected);
			debugRecord(selected + 1);
			debugRecord(selected + 2);
			return true;
		}
	}

	return false;
}

function checkSingle(seatData) {
	var holds = seatData.holds;
	var selected = -1;
	var c = 0;
	for (var i = 0; i < holds.length; ++i) {
		var pai = holds[i];
		c = seatData.countMap[pai];
		if (c != 0) {
			selected = pai;
			break;
		}
	}

	//如果没有找到剩余牌，则表示匹配成功了
	if (selected == -1) {
		return true;
	}

	//否则，进行匹配
	if (c == 3) {
		seatData.countMap[selected] = 0;
		debugRecord(selected);
		debugRecord(selected);
		debugRecord(selected);
		var ret = checkSingle(seatData);
		//立即恢复对数据的修改
		seatData.countMap[selected] = c;
		if (ret) {
			return true;
		}
	} else if (c == 4) {
		seatData.countMap[selected] = 1;
		debugRecord(selected);
		debugRecord(selected);
		debugRecord(selected);
		var ret = checkSingle(seatData);
		//立即恢复对数据的修改
		seatData.countMap[selected] = c;
		//如果作为一坎能够把牌匹配完，直接返回TRUE。
		if (ret) {
			return true;
		}
	}

	//按单牌处理
	return matchSingle(seatData, selected);
}

function checkCanHu(seatData) {
	for (var k in seatData.countMap) {
		k = parseInt(k);
		var c = seatData.countMap[k];
		if (c < 2) {
			continue;
		}

		//如果当前牌大于等于２，则将它选为将牌
		seatData.countMap[k] -= 2;
		//逐个判定剩下的牌是否满足　３Ｎ规则,一个牌会有以下几种情况
		//1、0张，则不做任何处理
		//2、2张，则只可能是与其它牌形成匹配关系
		//3、3张，则可能是单张形成 A-2,A-1,A  A-1,A,A+1  A,A+1,A+2，也可能是直接成为一坎
		//4、4张，则只可能是一坎+单张
		var ret = checkSingle(seatData);
		seatData.countMap[k] += 2;
		if (ret) {
			return true;
		}
	}
}

exports.getMJType = function(id) {
	if (id >= 0 && id < 9) {
		return 0;
	} else if (id >= 9 && id < 18) {
		return 1;
	} else if (id >= 18 && id < 27) {
		return 2;
	} else {
		return 3;
	}
};

exports.calcHoldMultiCardNum = function (seatData, num) {
	var cnt = 0;

	var map = seatData.countMap;
	for (var k in map) {
		k = parseInt(k);
		var c = map[k];

		if (c >= num) {
			cnt += 1;
		}
	}

	return cnt;
};

exports.checkSanYuan7Pairs = function (seatData) {
	var map = seatData.countMap;

	return (map[27] && map[27] >= 2 &&
		map[28] && map[28] >= 2 &&
		map[29] && map[29] >=2);
};

function calcCardNum(sd, k) {
	var cnt = 0;

	if (sd.countMap[k]) {
		cnt += sd.countMap[k];
	}

	if (sd.pengs.indexOf(k) != -1) {
		cnt += 3;
	}

	if (sd.angangs.indexOf(k) != -1) {
		cnt += 4;
	}

	if (sd.diangangs.indexOf(k) != -1) {
		cnt += 4;
	}

	if (sd.wangangs.indexOf(k) != -1) {
		cnt += 4;
	}

	return cnt;
};

exports.checkDaSanYuan = function (seatData) {
	var arr = [ calcCardNum(seatData, 27),
			calcCardNum(seatData, 28),
			calcCardNum(seatData, 29) ];

	var trip = 0;
	var doub = 0;

	for (var i = 0; i < arr.length; i++) {
		if (arr[i] >= 3) {
			trip += 1;
		} else if (arr[i] == 2) {
			doub += 1;
		}
	}

	if (3 == trip) {
		return true;
	} else {
		return false;
	}
};

exports.checkXiaoSanYuan = function (seatData) {
	var arr = [ calcCardNum(seatData, 27),
			calcCardNum(seatData, 28),
			calcCardNum(seatData, 29) ];

	var trip = 0;
	var doub = 0;

	for (var i = 0; i < arr.length; i++) {
		if (arr[i] >= 3) {
			trip += 1;
		} else if (arr[i] == 2) {
			doub += 1;
		}
	}

	if (2 == trip && doub == 1) {
		return true;
	} else {
		return false;
	}
};

exports.checkKaWuXing = function (seatData) {
	var holds = seatData.holds;
	var map = seatData.countMap;

	var pai = holds[holds.length - 1];

	if (pai != 4 && pai != 13) {
		return false;
	}

	if (!map[pai-1] || map[pai-1] < 1) {
		return false;
	}

	if (!map[pai+1] || map[pai+1] < 1) {
		return false;
	}

	map[pai-1] --;
	map[pai+1] --;
	map[pai] --;

	var ret = checkCanHu(seatData);

	map[pai-1] ++;
	map[pai+1] ++;
	map[pai] ++;

	return ret;
}

exports.checkMingSiGui = function (game, sd) {
	var strict = !(game.conf.pindao == 0);

	// 全频道
	if (!strict) {
		for (var i = 0; i < sd.pengs.length; i++) {
			var peng = sd.pengs[i];

			if (sd.countMap[peng] == 1) {
				return true;
			}
		}
	// 半频道
	} else {
		var pai = sd.holds[sd.holds.length - 1];
		for (var i = 0; i < sd.pengs.length; i++) {
			if (sd.pengs[i] == pai) {
				return true;
			}
		}
	}

	return false;
};

exports.checkAnSiGui = function (game, sd) {
	var strict = game.conf.pindao == 1 || game.conf.type == 'xgkwx';

	// 全频道
	if (!strict) {
		for (var i = 0; i < sd.holds.length; ++i) {
			var pai = sd.holds[i];
			if (sd.countMap[pai] == 4) {
				return true;
			}
		}

		return false;
	// 半频道
	} else {
		var pai = sd.holds[sd.holds.length - 1];
		return (sd.countMap[pai] == 4);
	}

};

function isSameType(type, arr) {
	for (var i = 0; i < arr.length; ++i) {
		var t = exports.getMJType(arr[i]);
		if (type != -1 && type != t) {
			return false;
		}

		type = t;
	}

	return true;
}

exports.checkQingYiSe = function (sd) {
	var type = exports.getMJType(sd.holds[0]);

	if (isSameType(type, sd.holds) &&
		isSameType(type, sd.angangs) &&
		isSameType(type, sd.wangangs) &&
		isSameType(type, sd.diangangs) &&
		isSameType(type, sd.pengs))
	{
		return true;
	}

	return false;
};

exports.shuKan = function(sd) {
	var kan = sd.angangs.length + sd.wangangs.length + sd.diangangs.length;

	return kan + exports.calcHoldMultiCardNum(sd, 3);
};

exports.getMaxColor = function(sd) {
	var colors = [ [ 0, 9 ], [ 9, 18 ], [ 27, 30 ] ];
	var max = 0;

	for (var i = 0; i < colors.length; i++) {
		var num = 0;
		for (var j = colors[i][0]; j < colors[i][1]; j++) {
			var c = sd.countMap[j];
			if (c != null) {
				num += c;
			}
		}

		if (num > max) {
			max = num;
		}
	}

	return max;
};

