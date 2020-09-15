var roomMgr = require("./roommgr");
var userMgr = require("./usermgr");
var mjutils = require('./mjutils');
var db = require("../utils/db");
var crypto = require("../utils/crypto");

var games = {};
var gamesIdBase = 0;

var ACTION_CHUPAI = 1;
var ACTION_MOPAI = 2;
var ACTION_PENG = 3;
var ACTION_GANG = 4;
var ACTION_HU = 5;
var ACTION_ZIMO = 6;
var ACTION_MING = 7;

var gameSeatsOfUsers = {};

var getMJType = mjutils.getMJType;

exports.numOfSeats = 3;

function shuffle(game) {
    var mahjongs = game.mahjongs;

    //筒
    var count = 0;
    for (var i = 0; i < 9; ++i) {
        for (var c = 0; c < 4; ++c) {
            mahjongs[count] = i;
            count++;
        }
    }
    //条
    for (var i = 9; i < 18; ++i) {
        for (var c = 0; c < 4; ++c) {
            mahjongs[count] = i;
            count++;
        }
    }

    // 中27 发28 白29 东30 南31 西32 北33
    for (var i = 27; i < 30; i++) {
        for (var c = 0; c < 4; ++c) {
            mahjongs[count] = i;
            count++;
        }
    }

    for (var i = 0; i < count; ++i) {
        var lastIndex = mahjongs.length - 1 - i;
        var index = Math.floor(Math.random() * lastIndex);
        var t = mahjongs[index];
        mahjongs[index] = mahjongs[lastIndex];
        mahjongs[lastIndex] = t;
    }
}

function dice(game) {
    var dices = game.dices;
    dices.push((Math.floor(Math.random() * 100) % 6) + 1);
    dices.push((Math.floor(Math.random() * 1000) % 6) + 1);
}

function maiMa(game) {
    if (game.currentIndex == game.mahjongs.length) {
        return -1;
    }

    return game.mahjongs[game.mahjongs.length - 1];
}

function getMaScore(ma) {
    var score = 0;
    if (ma < 27) {
        score = (ma % 9) + 1;
    } else {
        score = 10;
    }

    return score;
}

function mopai(game, seatIndex) {
    if (game.currentIndex == game.mahjongs.length) {
        return -1;
    }

    var seat = game.gameSeats[seatIndex];
    var mahjongs = seat.holds;
    var pai = game.mahjongs[game.currentIndex];

    mahjongs.push(pai);

    //统计牌的数目 ，用于快速判定（空间换时间）
    var c = seat.countMap[pai];
    if (c == null) {
        c = 0;
    }

    seat.countMap[pai] = c + 1;
    game.currentIndex++;

    return pai;
}

function lucky_mopai(game, seatIndex) {
    if (game.cusrrentIndex == game.mahjongs.length) {
        return -1;
    }
    var seat = game.gameSeats[seatIndex];
    var mahjongs = seat.holds;
    var pai = game.mahjongs[game.currentIndex];
    // 检测听牌
    let tingMap = seat.tingMap;
    if (Object.keys(tingMap).length > 0){
        for (let key in tingMap) {
            key = parseInt(key);
            let index = game.mahjongs.indexOf(key,game.currentIndex);
           // console.log(`检查听牌:`,key,'index:',index);
            if (index == -1){continue;}
            game.mahjongs[game.currentIndex] = game.mahjongs[index];
            game.mahjongs[index] = pai;
            break;
        }
    }
    pai = game.mahjongs[game.currentIndex];
    mahjongs.push(pai);
    //console.log('公共牌：',game.mahjongs);
    //统计牌的数目 ，用于快速判定（空间换时间）
    var c = seat.countMap[pai];
    if (c == null) {
        c = 0;
    }

    seat.countMap[pai] = c + 1;
    game.currentIndex++;

    return pai;
}

function new_deal(game, cb) {
    game.currentIndex = 0;

    var seatIndex = game.button;
    var numOfSeats = game.numOfSeats;

    for (var i = 0; i < (numOfSeats * 13); i++) {
        var mahjongs = game.gameSeats[seatIndex].holds;

        if (mahjongs == null) {
            mahjongs = [];
            game.gameSeats[seatIndex].holds = mahjongs;
        }

        mopai(game, seatIndex);
        seatIndex = (seatIndex + 1) % numOfSeats;
    }

    mopai(game, game.button);
    game.turn = game.button;

    var actions = [];
    var seats = game.roomInfo.seats;
    var nums = [0, 0, 0];

    var execute = function () {
        if (actions.length == 0) {
            if (cb) {
                cb();
            }

            return;
        }

        var act = actions[0];
        var si = act.seatIndex;
        var s = seats[si];
        var uid = s.userId;

        nums[si] = act.holds.length;

        userMgr.sendMsg(uid, 'game_holds_update_push', act.holds);

        userMgr.broacastInRoom('game_holds_len_push', { seatIndex: si, len: act.holds.length }, uid, false);

        var numOfMJ = game.mahjongs.length;
        for (var i = 0; i < nums.length; i++) {
            numOfMJ -= nums[i];
        }

        userMgr.broacastInRoom('mj_count_push', numOfMJ, uid, true);

        actions.splice(0, 1);

        setTimeout(execute, act.to);
    };

    seatIndex = game.button;

    for (var j = 0; j < 3; j++) {
        for (var i = 0; i < numOfSeats; i++) {
            var holds = game.gameSeats[seatIndex].holds;
            var act = {
                seatIndex: seatIndex,
                holds: holds.slice(0, (j + 1) * 4),
                to: 250,
            };

            actions.push(act);

            seatIndex = (seatIndex + 1) % numOfSeats;
        }
    }

    seatIndex = game.button;
    for (var i = 0; i < numOfSeats; i++) {
        var holds = game.gameSeats[seatIndex].holds;
        var act = {
            seatIndex: seatIndex,
            holds: holds.slice(0),
            to: 200,
        };

        actions.push(act);

        seatIndex = (seatIndex + 1) % numOfSeats;
    }

    execute();
}

function deal(game) {
    //强制清0
    game.currentIndex = 0;

    //每人13张 一共 13*3 ＝ 39张 庄家多一张 40张
    var seatIndex = game.button;
    var numOfSeats = game.numOfSeats;

    for (var i = 0; i < (numOfSeats * 13); ++i) {
        var mahjongs = game.gameSeats[seatIndex].holds;

        if (mahjongs == null) {
            mahjongs = [];
            game.gameSeats[seatIndex].holds = mahjongs;
        }

        mopai(game, seatIndex);
        seatIndex = (seatIndex + 1) % numOfSeats;
    }

    //庄家多摸最后一张
    mopai(game, game.button);
    //当前轮设置为庄家
    game.turn = game.button;
}

function checkCanPeng(game, seatData, targetPai) {
    if (seatData.hasMingPai) {
        return;
    }

    var count = seatData.countMap[targetPai];
    if (count != null && count >= 2) {
        seatData.canPeng = true;
    }
}

//检查是否可以点杠
function checkCanDianGang(game, seatData, targetPai) {
    //如果没有牌了，则不能再杠
    if (game.mahjongs.length <= game.currentIndex) {
        return;
    }

    var count = seatData.countMap[targetPai];
    if (count != null && count >= 3) {
        if (!seatData.hasMingPai || seatData.kou.indexOf(targetPai) != -1) {
            seatData.canGang = true;
            seatData.gangPai.push(targetPai);
            return;
        }
    }
}

//检查是否可以暗杠
function checkCanAnGang(game, seatData) {
    //如果没有牌了，则不能再杠
    if (game.mahjongs.length <= game.currentIndex) {
        return;
    }

    for (var key in seatData.countMap) {
        var pai = parseInt(key);
        var c = seatData.countMap[key];
        if (c != null && c == 4) {
            if (!seatData.hasMingPai || seatData.kou.indexOf(pai) != -1) {
                seatData.canGang = true;
                seatData.gangPai.push(pai);
            }
        }
    }
}

//检查是否可以弯杠(自己摸起来的时候)
function checkCanWanGang(game, seatData, do_pai) {
    //如果没有牌了，则不能再杠
    if (game.mahjongs.length <= game.currentIndex) {
        return;
    }

    //从碰过的牌中选
    for (var i = 0; i < seatData.pengs.length; ++i) {
        var pai = seatData.pengs[i];
        if (seatData.hasMingPai) {
            if (do_pai == pai){
                seatData.canGang = true;
                seatData.gangPai.push(pai);
                break;
            }
            continue;
        }
        if (seatData.countMap[pai] == 1) {
            seatData.canGang = true;
            seatData.gangPai.push(pai);
        }
        
    }
}

function checkCanHu(game, seatData, pai, ignoreCheckFan) {
    game.lastHuPaiSeat = -1;

    var ting = seatData.tingMap[pai];

    if (!ting) {
        seatData.canHu = false;
        return;
    }

    if (game.turn == seatData.seatIndex ||
        (supportHaidi(game) && game.currentIndex == game.mahjongs.length)) {
        seatData.canHu = true;
        return;
    }

    var turnSeat = game.gameSeats[game.turn];

    // 明牌
    if (seatData.hasMingPai ||
        turnSeat.hasMingPai ||
        ignoreCheckFan ||
        ting.fan >= 1) {
        seatData.canHu = true;
        return;
    }
    //console.log('检测杠上炮:',turnSeat.lastFangGangSeat);
    // 杠上炮
    if (turnSeat.lastFangGangSeat >= 0) {
        seatData.canHu = true;
        return;
    }

    var found = false;

    var arr = [2, 5, 8, 11, 14];
    var full = (arr.indexOf(seatData.holds.length) >= 0);
    var old = seatData.countMap[pai];

    if (!full) {
        seatData.holds.push(pai);
        if (old == null) {
            seatData.countMap[pai] = 1;
        } else {
            seatData.countMap[pai]++;
        }
    }

    if (
        mjutils.checkQingYiSe(seatData) ||
        mjutils.checkKaWuXing(seatData) ||
        mjutils.checkMingSiGui(game, seatData) ||
        mjutils.checkAnSiGui(game, seatData) ||
        mjutils.checkDaSanYuan(seatData) ||
        mjutils.checkXiaoSanYuan(seatData)) {
        found = true;
    }

    if (!full) {
        seatData.holds.pop(pai);
        seatData.countMap[pai] = old;
    }

    seatData.canHu = found;
}

function clearAllOptions(game, seatData) {
    var fnClear = function (sd) {
        sd.canPeng = false;
        sd.canGang = false;
        sd.gangPai = [];
        sd.canHu = false;
        sd.canMingPai = false;
        sd.lastFangGangSeat = -1;
    }

    if (seatData) {
        fnClear(seatData);
    } else {
        game.qiangGangContext = null;
        for (var i = 0; i < game.gameSeats.length; ++i) {
            fnClear(game.gameSeats[i]);
        }
    }
}

function clearContinuousGangs(game) {
    game.continuousGangs = 0;
}

function getTingList(sd) {
    var tings = [];
    for (var k in sd.tingMap) {
        var c = parseInt(k);
        tings.push(c);
    }

    sd.tings = tings;

    return tings;
};

//检查听牌
function checkCanTingPai(game, seatData) {
    seatData.tingMap = {};

    var kou = seatData.kou;

    //检查是否是七对 前提是没有碰，也没有杠 ，即手上拥有13张牌
    if (kou && kou.length == 0 && seatData.holds.length >= 13) {
        var hu = false;
        var danPai = -1;
        var pairCount = 0;

        for (var k in seatData.countMap) {
            var c = seatData.countMap[k];
            if (c == 2 || c == 3) {
                pairCount++;
            } else if (c == 4) {
                pairCount += 2;
            }

            if (c == 1 || c == 3) {
                //如果已经有单牌了，表示不止一张单牌，直接闪
                if (danPai >= 0) {
                    break;
                }

                danPai = k;
            }
        }

        //检查是否有6对 并且单牌是不是目标牌
        if (pairCount == 6) {
            //七对只能和一张，就是手上那张单牌
            seatData.tingMap[danPai] = {
                pattern: "7pairs",
                fan: 2,
            };
        }
    }

    //检查是否是对对胡
    //对对胡叫牌有两种情况
    //1、N坎 + 1张单牌
    //2、N-1坎 + 两对牌
    var singleCount = 0;
    var colCount = 0;
    var pairCount = 0;
    var arr = [];

    for (var k in seatData.countMap) {
        var c = seatData.countMap[k];
        if (c == 1) {
            singleCount++;
            arr.push(k);
        } else if (c == 2) {
            pairCount++;
            arr.push(k);
        } else if (c == 3) {
            colCount++;
        } else if (c == 4) {
            //手上有4个一样的牌，在四川麻将中是和不了对对胡的 随便加点东西
            singleCount++;
            pairCount += 2;
        }
    }

    if ((pairCount == 2 && singleCount == 0) || (pairCount == 0 && singleCount == 1)) {
        for (var i = 0; i < arr.length; ++i) {
            //对对胡1番
            var p = arr[i];
            if (seatData.tingMap[p] == null) {
                seatData.tingMap[p] = {
                    pattern: "duidui",
                    fan: 1,
                };
            }
        }
    }
    let mark_kou = [];
    for (var i = 0; i < kou.length; i++) {
        var pai = kou[i];
        mark_kou.push(seatData.countMap[pai]);
        seatData.countMap[pai] -= seatData.countMap[pai];
        //seatData.holds
        // TODO 从holds里把kou的牌都上了，检测完后再加上
    }

    //检查是不是平胡
    mjutils.checkTingPai(seatData, 0, 9);
    mjutils.checkTingPai(seatData, 9, 18);
    mjutils.checkTingPai(seatData, 27, 30);

    for (var i = 0; i < kou.length; i++) {
        var pai = kou[i];
        seatData.countMap[pai] += mark_kou[i];
    }
}

function checkCanChuPai(game, seatData, pai) {
    for (var i = 0; i < game.gameSeats.length; ++i) {
        var sd = game.gameSeats[i];

        if (i == seatData.seatIndex) {
            continue;
        }

        if (sd.hasMingPai && sd.tings && sd.tings.indexOf(pai) >= 0) {
            return false;
        }
    }

    return true;
}

function checkCanMingPai(game, sd) {
    if (sd.hasMingPai) {
        return;
    }

    if (game.conf.type == 'xgkwx' && game.conf.chkming && sd.holds.length < 12) {
        return;
    }

    var oldmap = sd.tingMap;

    sd.mingPai = [];

    for (var k in sd.countMap) {
        var c = sd.countMap[k];
        var pai = parseInt(k);
        if (0 == c) {
            continue;
        }

        sd.countMap[k]--;

        checkCanTingPai(game, sd);

        if (isTinged(sd) && checkCanChuPai(game, sd, pai)) {
            sd.mingPai.push(pai)
        }

        sd.countMap[k] = c;
    }

    if (sd.mingPai.length > 0) {
        sd.canMingPai = true;
    }

    sd.tingMap = oldmap;
}

function getSeatIndex(userId) {
    var seatIndex = roomMgr.getUserSeatId(userId);
    if (seatIndex == null) {
        return null;
    }

    return seatIndex;
}

function getGameByUserID(userId) {
    var roomId = roomMgr.getUserRoom(userId);
    if (roomId == null) {
        return null;
    }

    var game = games[roomId];
    return game;
}

function hasOperations(seatData) {
    return (seatData.canGang || seatData.canPeng || seatData.canHu || (!seatData.hasMingPai && seatData.canMingPai));
}

function sendOperations(game, seatData, pai) {
    if (hasOperations(seatData)) {
        if (pai == -1) {
            pai = seatData.holds[seatData.holds.length - 1];
        }

        var data = {
            pai: pai,
            hu: seatData.canHu,
            peng: seatData.canPeng,
            gang: seatData.canGang,
            gangpai: seatData.gangPai,
            si: seatData.seatIndex,
            ming: seatData.canMingPai,
            mingpai: seatData.mingPai,
        };
        if ((game.roomInfo.dr && game.roomInfo.dr.online[seatData.seatIndex]) || !game.roomInfo.dr){
            //如果可以有操作，则进行操作
            userMgr.sendMsg(seatData.userId, 'game_action_push', data);
        }
    } else {
        userMgr.sendMsg(seatData.userId, 'game_action_push');
    }

    var autoAction = function () {
        var uid = seatData.userId;
        if (seatData.canHu) {
            exports.hu(uid);
        } else if (seatData.canGang && seatData.kou.indexOf(pai)!=-1) {
            exports.gang(uid, pai);
        } else if (seatData.canChuPai) {
            var chupai = seatData.holds[seatData.holds.length - 1];
            exports.chuPai(uid, chupai);
        }
        // if (seatData.canHu) {
        //     exports.hu(uid);
        // } else if (seatData.canChuPai) {
        //     var chupai = seatData.holds[seatData.holds.length - 1];
        //     exports.chuPai(uid, chupai);
        // }
    };

    if (seatData.hasMingPai) {
        setTimeout(autoAction, 1000);
    }else if (game.roomInfo.dr && !game.roomInfo.dr.online[seatData.seatIndex]){
        setTimeout(()=>{
            if (seatData.canChuPai) {
                var chupai = seatData.holds[seatData.holds.length - 1];
                exports.chuPai(seatData.userId, chupai);
            }
        }, 1000);
    }
}

function moveToNextUser(game, nextSeat) {
    game.fangpaoshumu = 0;

    if (nextSeat == null) {
        game.turn++;
        game.turn %= game.numOfSeats;
        return;
    } else {
        game.turn = nextSeat;
    }
}

function doUserMoPai(game) {
    game.chuPai = -1;

    var turn = game.turn;1
    var seat = game.gameSeats[turn];
    var uid = seat.userId;
    seat.lastFangGangSeat = -1;
    clearContinuousGangs(game);
    if (seat.lucky == 1) {
        var pai = lucky_mopai(game, turn);
    }else{
        var pai = mopai(game, turn);
    }

    if (pai == -1) {
        doGameOver(game, seat.userId);
        return;
    } else {
        var numOfMJ = game.mahjongs.length - game.currentIndex;
        userMgr.broacastInRoom('mj_count_push', numOfMJ, uid, true);
    }

    recordGameAction(game, turn, ACTION_MOPAI, pai);

    var info = {
        pai: pai,
        userId: uid,
    };

    //通知前端新摸的牌
    if (seat.hasMingPai) {
        userMgr.broacastInRoom('game_mopai_push', info, uid, true);
    } else {
        userMgr.sendMsg(uid, 'game_mopai_push', info);
        info.pai = -1;
        userMgr.broacastInRoom('game_mopai_push', info, uid, false);
    }

    //检查是否可以暗杠或者胡
    //检查胡，直杠，弯杠
    if (!seat.hued) {
        checkCanAnGang(game, seat);
    }

    //如果未胡牌，或者摸起来的牌可以杠，才检查弯杠
    if (!seat.hued || seat.holds[seat.holds.length - 1] == pai) {
        checkCanWanGang(game, seat, pai);
    }

    //检查看是否可以和
    checkCanHu(game, seat, pai);

    //检查看是否可以明牌
    checkCanMingPai(game, seat);

    //广播通知玩家出牌方
    seat.canChuPai = true;
    userMgr.broacastInRoom('game_chupai_push', uid, uid, true);

    //通知玩家做对应操作
    sendOperations(game, seat, game.chuPai);
}

// reserved
function isMenQing(seatData) {
    return (seatData.pengs.length + seatData.wangangs.length + seatData.diangangs.length) == 0;
}

// reserved
function isZhongZhang(seatData) {
    var fn = function (arr) {
        for (var i = 0; i < arr.length; ++i) {
            var pai = arr[i];
            if (pai == 0 || pai == 8 || pai == 9 || pai == 17 || pai == 18 || pai == 26) {
                return false;
            }
        }

        return true;
    }

    if (fn(seatData.pengs) &&
        fn(seatData.angangs) &&
        fn(seatData.diangangs) &&
        fn(seatData.wangangs) &&
        fn(seatData.holds)) {
        return true;
    }

    return false;
}

//reserved
function isJiangDui(gameSeatData) {
    var fn = function (arr) {
        for (var i = 0; i < arr.length; ++i) {
            var pai = arr[i];
            if (pai != 1 && pai != 4 && pai != 7 &&
                pai != 9 && pai != 13 && pai != 16 &&
                pai != 18 && pai != 21 && pai != 25) {
                return false;
            }
        }

        return true;
    }

    if (fn(seatData.pengs) &&
        fn(seatData.angangs) &&
        fn(seatData.diangangs) &&
        fn(seatData.wangangs) &&
        fn(seatData.holds)) {
        return true;
    }

    return false;
}

function isTinged(seatData) {
    for (var k in seatData.tingMap) {
        return true;
    }

    return false;
}

function computeFanScore(game, fan) {
    if (fan > game.conf.maxFan) {
        fan = game.conf.maxFan;
    }

    return (1 << fan) * game.baseScore;
}

function findMaxFanTingPai(ts) {
    //找出最大番
    var cur = null;
    for (var k in ts.tingMap) {
        var tpai = ts.tingMap[k];
        if (cur == null || tpai.fan > cur.fan) {
            cur = tpai;
            cur.pai = parseInt(k);
        }
    }

    return cur;
}

// no use
function findUnTingedPlayers(game) {
    var arr = [];
    for (var i = 0; i < game.gameSeats.length; ++i) {
        var ts = game.gameSeats[i];
        //如果没有胡，且没有听牌
        if (!ts.hued && !isTinged(ts)) {
            arr.push(i);
        }
    }

    return arr;
}

function getNumOfGen(seatData) {
    var numOfGangs = seatData.diangangs.length + seatData.wangangs.length + seatData.angangs.length;

    for (var k = 0; k < seatData.pengs.length; ++k) {
        var pai = seatData.pengs[k];
        if (seatData.countMap[pai] == 1) {
            numOfGangs++;
        }
    }

    for (var k in seatData.countMap) {
        if (seatData.countMap[k] == 4) {
            numOfGangs++;
        }
    }

    return numOfGangs;
}

function getFan(game, sd, pai) {
    var info = sd.tingMap[pai];
    var type = game.conf.type;

    sd.holds.push(pai);
    if (sd.countMap[pai] != null) {
        sd.countMap[pai]++;
    } else {
        sd.countMap[pai] = 1;
    }

    var qingyise = mjutils.checkQingYiSe(sd) || null;
    var isJinGouHu = (sd.holds.length == 1 || sd.holds.length == 2) || null;
    var fan = info.fan;

    if (qingyise) {
        fan += 2;
    }

    if (isJinGouHu) {
        fan += 2;
    }

    if (info.pattern == '7pairs') {
        var dragon = mjutils.calcHoldMultiCardNum(sd, 4);
        var sanyuan7pairs = mjutils.checkSanYuan7Pairs(sd);

        if (3 == dragon) {
            fan += 5;
        } else if (2 == dragon) {
            fan += 3;
        } else if (sanyuan7pairs) {
            fan += 3;
        } else if (1 == dragon) {
            fan += 1;
        }
    } else {
        if (mjutils.checkDaSanYuan(sd)) {
            fan += 3;
        } else if (mjutils.checkXiaoSanYuan(sd)) {
            fan += 2;
        }

        if (mjutils.checkKaWuXing(sd)) {
            if (type == 'sykwx') {
                fan += 2;
            } else {
                fan += 1;
            }
        }

        if (mjutils.checkMingSiGui(game, sd)) {
            fan += 1;
        } else if (mjutils.checkAnSiGui(game, sd)) {
            fan += 2;
        }
    }

    sd.holds.pop();
    sd.countMap[pai]--;

    if (fan > game.conf.maxFan) {
        fan = game.conf.maxFan;
    }

    return computeFanScore(game, fan);
}

function getMaxFan(game, sd) {
    var maxFan = 0;

    for (var k in sd.tingMap) {
        var fan = getFan(game, sd, parseInt(k));

        if (fan > maxFan) {
            maxFan = fan;
        }
    }

    return maxFan;
}

function supportHaidi(game) {
    var conf = game.conf;
    return (conf.type == 'xykwx' && conf.pindao == 0) || conf.type == 'sykwx';
}

function calculateResult(game, roomInfo) {
    var baseScore = game.baseScore;
    var numOfHued = 0;
    var conf = game.conf;
    var type = conf.type;

    for (var i = 0; i < game.gameSeats.length; ++i) {
        var sd = game.gameSeats[i];
        var detail = sd.detail;
        var hu = sd.hu;

        for (var a = 0; a < sd.actions.length; ++a) {
            var ac = sd.actions[a];
            if (ac.type == "fanggang") {

            } else if (ac.type == "angang" || ac.type == "wangang" || ac.type == "diangang") {
                var acscore = ac.score;
                var gang = ac.targets.length * acscore;
                detail.gang += gang;

                for (var t = 0; t < ac.targets.length; ++t) {
                    var six = ac.targets[t];
                    var gs = game.gameSeats[six];
                    gs.detail.gang -= acscore;
                }
            }
        }

        hu.qingyise = mjutils.checkQingYiSe(sd) || null;
        hu.isJinGouHu = (sd.holds.length == 1 || sd.holds.length == 2) || null;
        //sd.numAnGang = sd.angangs.length;
        //sd.numMingGang = sd.wangangs.length + sd.diangangs.length;

        var tips = [];

        //进行胡牌结算
        for (var j = 0; j < sd.huInfo.length; ++j) {
            var info = sd.huInfo[j];
            var is7pairs = false;

            hu.action = info.action;
            hu.hued = info.ishupai;

            if (!info.ishupai) {
                sd.numDianPao++;
                continue;
            }

            numOfHued += 1;

            //统计自己的番子和分数
            //基础番(平胡0番，对对胡1番，七对2番) + 清一色2番 + 小三元2番 + 大三元3番
            //龙七对3番，双龙七对5番，三龙七对7番，卡五星1番，三元七对5番，明四归1番，暗四归2番，手抓一2番
            //杠开1番，杠上炮1番，明牌1番，抢杠1番
            var fan = info.fan;
            sd.holds.push(info.pai);
            if (sd.countMap[info.pai] != null) {
                sd.countMap[info.pai]++;
            } else {
                sd.countMap[info.pai] = 1;
            }

            // 清一色2番
            if (hu.qingyise) {
                fan += 2;
                tips.push('清一色x4');
            }

            // 手抓一2番
            if (hu.isJinGouHu) {
                fan += 2;
                tips.push('手抓一x2');
            }

            if (info.pattern == '7pairs') {
                var dragon = mjutils.calcHoldMultiCardNum(sd, 4);
                var sanyuan7pairs = mjutils.checkSanYuan7Pairs(sd);

                is7pairs = true;

                // 三龙七对7番
                if (3 == dragon) {
                    fan += 5;
                    info.pattern = '3l7pairs';
                    tips.push('超超豪华七对x128');
                    hu.typeOf7Pairs = '3d';
                    // 双龙七对5番
                } else if (2 == dragon) {
                    fan += 3;
                    info.pattern = '2l7pairs';
                    tips.push('超豪华七对x32');
                    hu.typeOf7Pairs = '2d';
                    // 三元七对5番
                } else if (sanyuan7pairs) {
                    fan += 3;
                    info.pattern = '3y7pairs';
                    tips.push('三元七对x32');
                    hu.typeOf7Pairs = '3y';
                    // 龙七对3番
                } else if (1 == dragon) {
                    fan += 1;
                    info.pattern = 'l7pairs'
                    tips.push('豪华七对x8');
                    hu.typeOf7Pairs = '1d';
                } else {
                    tips.push('七对x4');
                    hu.typeOf7Pairs = '0d';
                }
            } else {
                if (info.pattern == 'duidui') {
                    tips.push('碰碰胡x2');
                    hu.isDuiDuiHu = true;
                }

                // 大三元3番
                if (mjutils.checkDaSanYuan(sd)) {
                    fan += 3;
                    tips.push('大三元x8');
                    hu.isDaSanYuan = true;
                } else if (mjutils.checkXiaoSanYuan(sd)) {
                    // 小三元2番
                    fan += 2;
                    tips.push('小三元x4');
                    hu.isXiaoSanYuan = true;
                }

                // 卡五星1番
                if (mjutils.checkKaWuXing(sd)) {
                    if (type == 'sykwx') {
                        fan += 2;
                        tips.push('卡五星x4');
                    } else {
                        fan += 1;
                        tips.push('卡五星x2');
                    }

                    hu.isKaWuXing = true;
                }

                // 明四归1番
                if (mjutils.checkMingSiGui(game, sd)) {
                    fan += 1;
                    tips.push('明四归x2');
                    hu.isMingSiGui = true;
                    // 暗四归2番
                } else if (mjutils.checkAnSiGui(game, sd)) {
                    fan += 2;
                    tips.push('暗四归x4');
                    hu.isAnSiGui = true;
                }
            }

            if (supportHaidi(game) && sd.isHaiDiHu) {
                fan += 1;
                if (info.iszimo) {
                    tips.push('海底捞x2');
                    hu.isHaiDiLao = true;
                } else {
                    tips.push('海底炮x2');
                    hu.isHaiDiPao = true;
                }
            }

            // 明牌1番
            if (sd.hasMingPai) {
                fan += 1;
                tips.push('明牌x2');
            } else if (!info.iszimo) {
                var gs = game.gameSeats[info.target];
                if (gs.hasMingPai) {
                    fan += 1;
                    tips.push('明牌x2');
                }
            }

            // 杠开1番，杠上炮1番，抢杠1番
            if (info.action == "ganghua" || info.action == "dianganghua" || info.action == "gangpaohu" || info.action == "qiangganghu") {
                fan += 1;
                if (info.action == "ganghua") {
                    tips.push('杠开x2');
                } else if (info.action == "gangpaohu") {
                    tips.push('杠上炮x2');
                } else if (info.action == "qiangganghu") {
                    tips.push('抢杠x2');
                }
            }

            if (fan > game.conf.maxFan) {
                fan = game.conf.maxFan;
            }

            info.fan = fan;

            var score = computeFanScore(game, fan);

            if (conf.shukan) {
                var kan = 0;
                if (!is7pairs) {
                    kan = mjutils.shuKan(sd);
                }

                if (kan > 0) {
                    tips.push('数坎+' + kan);
                }

                score += kan;
            }

            // 跑恰摸八
            if (conf.pqmb) {
                var add = 1;

                tips.push('跑+1');

                var kan = 0;
                if (!is7pairs) {
                    kan = mjutils.shuKan(sd);
                }

                tips.push('恰+' + kan);
                add += kan;

                var mo = info.iszimo ? 1 : 0;

                tips.push('摸+' + mo);
                add += mo;

                var ba = mjutils.getMaxColor(sd) - 7;
                if (ba < 0) {
                    ba = 0;
                }

                tips.push('八+' + ba);
                add += ba;

                score += add;
            }

            var up = game.baseScore / game.conf.baseScore;
            if (up > 1) {
                tips.push('上楼x' + up);
            }

            if (info.iszimo) {
                // 马钱
                var maima = sd.maima;
                var maScore = 0;
                if (maima != null) {
                    maima.forEach(element => {
                        maScore += element.fan;
                    });
                    tips.push('买马+' + maScore);
                }
                //收所有人的钱
                for (var t = 0; t < game.gameSeats.length; t++) {
                    if (t == i) {
                        continue;
                    }

                    var gs = game.gameSeats[t];
                    var realScore = score;

                    if (!sd.hasMingPai && gs.hasMingPai) {
                        realScore = computeFanScore(game, fan + 1);
                    }

                    realScore += maScore;

                    gs.score -= realScore;
                    sd.score += realScore;
                }

                detail.fan = score + maScore;

                sd.numZiMo++;

                // 漂钱
                var rs = roomInfo.seats[i];

                for (var t = 0; t < game.gameSeats.length; t++) {
                    if (t == i) {
                        continue;
                    }

                    var piaos = 0;
                    var tmprs = roomInfo.seats[t];
                    var gs = game.gameSeats[t];

                    piaos += rs.dingpiao > 0 ? rs.dingpiao * game.conf.baseScore: 0;
                    piaos += tmprs.dingpiao > 0 ? tmprs.dingpiao * game.conf.baseScore: 0;

                    if (piaos > 0) {
                        sd.score += piaos;
                        gs.score -= piaos;
                    }

                    detail.piao += piaos;
                    gs.detail.piao -= piaos;
                }
            } else {
                //收放炮者的钱
                var gs = game.gameSeats[info.target];

                sd.score += score;
                gs.score -= score;

                detail.fan = score;

                sd.numJiePao++;

                var piaos = 0;
                var rs = roomInfo.seats[i];
                var tmprs = roomInfo.seats[info.target];
                var gs = game.gameSeats[info.target];

                // 漂钱
                piaos += rs.dingpiao > 0 ? rs.dingpiao * game.conf.baseScore: 0;
                piaos += tmprs.dingpiao > 0 ? tmprs.dingpiao * game.conf.baseScore: 0;

                if (piaos > 0) {
                    sd.score += piaos;
                    gs.score -= piaos;
                }

                detail.piao += piaos;
                gs.detail.piao -= piaos;
            }

            //撤除胡的那张牌
            sd.holds.pop();
            sd.countMap[info.pai]--;
        }

        hu.numDianPao = sd.numDianPao;

        //一定要用 += 。 因为此时的sd.score可能是负的
        //sd.score += additonalscore;

        if (tips.length > 0) {
            detail.tips = tips.join(' ');
        }
    }

    var fnCheckTing = function (game) {
        game.allTing = true;

        for (var i = 0; i < game.gameSeats.length; ++i) {
            var sd = game.gameSeats[i];

            if (sd.hasMingPai) {
                sd.hasTingPai = true;
                continue;
            }

            checkCanTingPai(game, sd);
            sd.hasTingPai = isTinged(sd);

            if (!sd.hasTingPai) {
                game.allTing = false;
            }
        }
    };

    var fnFirstMing = function (game, base) {
        var fd = game.gameSeats[game.firstMingPai];
        fd.firstMingPai = true;

        fd.peifu = true;

        for (var i = 0; i < game.gameSeats.length; ++i) {
            var sd = game.gameSeats[i];

            if (i != game.firstMingPai) {
                sd.score += base;
                fd.score -= base;
            }
        }
    };

    var fnChajiao = function (game, base) {
        var tinged = [];
        var notTinged = [];

        for (var i = 0; i < game.gameSeats.length; ++i) {
            var sd = game.gameSeats[i];
            if (sd.hasTingPai) {
                tinged.push(sd);
            } else {
                notTinged.push(sd);
            }
        }

        if (tinged.length == 0 || notTinged.length == 0) {
            return;
        }

        for (var i = 0; i < tinged.length; i++) {
            var sd = tinged[i];
            var score = (base != null) ? base : getMaxFan(game, sd);

            for (var j = 0; j < notTinged.length; j++) {
                var td = notTinged[j];

                sd.score += score;
                td.score -= score;

                if (base != null) {
                    td.peifu = true;
                } else {
                    td.chajiao = true;
                }
            }
        }
    };

    var fnMingPay = function () {
        var minged = [];
        var notMinged = [];

        for (var i = 0; i < game.gameSeats.length; ++i) {
            var sd = game.gameSeats[i];
            if (sd.hasMingPai) {
                minged.push(sd);
            } else {
                notMinged.push(sd);
            }
        }

        if (minged.length == 0 || notMinged.length == 0) {
            return;
        }

        for (var i = 0; i < notMinged.length; i++) {
            var sd = notMinged[i];
            var score = getMaxFan(game, sd);

            for (var j = 0; j < minged.length; j++) {
                var md = minged[j];

                sd.score += score;
                md.score -= score;

                md.peifu = true;
            }
        }

    };

    if (numOfHued == 0) {
        if (type == 'xykwx' || type == 'sykwx' || type == 'yckwx') {
            var base = 1;
            if (type == 'sykwx') {
                base = 2;

                if (game.conf.chajiao) {
                    fnChajiao(game);
                }
            }

            if (game.firstMingPai >= 0) {
                fnFirstMing(game, base);
            }
        } else if (type == 'szkwx') {
            fnCheckTing(game);

            if (game.allTing) {
                fnFirstMing(game, 1);
            } else {
                fnChajiao(game, 1);
            }
        } else if (type == 'xgkwx') {
            fnCheckTing(game);

            if (game.allTing) {
                fnMingPay(game);
            } else {
                fnChajiao(game);
            }
        }

        for (var i = 0; i < game.gameSeats.length; ++i) {
            var sd = game.gameSeats[i];
            var hu = sd.hu;
            hu.action = 'huangzhuang';

            var detail = sd.detail;
            detail.tips = '荒庄';
        }
    }

    var up = game.conf.up && (game.yipaoduoxiang >= 0 || numOfHued == 0);
    if (game.conf.up) {
        if (up) {
            roomInfo.nextUp += 1;
        } else {
            roomInfo.nextUp = 0;
        }
    }

    for (var i = 0; i < game.gameSeats.length; ++i) {
        var sd = game.gameSeats[i];
        var detail = sd.detail;

        detail.score = sd.score + detail.gang;

        if (up) {
            sd.hu.up = true;
        }
    }
}

function getRoomInfo(uid) {
    var roomId = roomMgr.getUserRoom(uid);
    if (roomId == null) {
        return null;
    }

    return roomMgr.getRoom(roomId);
}

async function doGameOver(game, userId, forceEnd) {
    var roomId = roomMgr.getUserRoom(userId);
    if (roomId == null) {
        return;
    }

    var roomInfo = roomMgr.getRoom(roomId);
    if (roomInfo == null) {
        return;
    }

    var results = [];
    var dbresult = [0, 0, 0, 0];
    var info = {};

    if (forceEnd) {
        info.dissolve = true;
    }

    var fnNoticeResult = function (isEnd) {
        var endinfo = null;
        if (isEnd) {
            endinfo = [];
            for (var i = 0; i < roomInfo.seats.length; ++i) {
                var rs = roomInfo.seats[i];
                endinfo.push({
                    numzimo: rs.numZiMo,
                    numjiepao: rs.numJiePao,
                    numdianpao: rs.numDianPao,
                    numangang: rs.numAnGang,
                    numminggang: rs.numMingGang,
                });
            }

            info.end = true;
        }

        var fnGameOver = function () {
            //console.log(results);
            if (results.length == 0 && isEnd){
                userMgr.broacastAllInRoom('dispress_push', {}, roomId);
            }
            userMgr.broacastInRoom('game_over_push', { results: results, endinfo: endinfo, info: info }, userId, true);

            //如果局数已够，则进行整体结算，并关闭房间
            if (isEnd) {
                roomInfo.end = true;

                setTimeout(function () {
                    if (roomInfo.numOfGames >= 1) {
                        store_history(roomInfo);
                    }

                    userMgr.kickAllInRoom(roomId);
                    roomMgr.destroy(roomId);
                    db.archive_games(roomInfo.uuid);
                }, 1500);
            }
        }

        fnGameOver();
    }
    var difen_veriyf = false;
    if (game != null) {
        if (!forceEnd) {
            calculateResult(game, roomInfo);

            if (game.firstHupai < 0) {
                info.huangzhuang = true;
            }
        } else {
            for (var i = 0; i < game.gameSeats.length; ++i) {
                var sd = game.gameSeats[i];
                var hu = sd.hu;
                var detail = sd.detail;

                hu.action = 'huangzhuang';
                detail.tips = '荒庄';
                detail.score = sd.score + detail.gang;
            }
        }
        if (roomInfo.numOfGames == 1) {
            //var water_average = await db.get_water(roomInfo.org_id);
            var water_average = await roomInfo.conf.pump;
        }else{
            var water_average = 0;
        }
        for (var i = 0; i < roomInfo.seats.length; ++i) {
            var rs = roomInfo.seats[i];
            var sd = game.gameSeats[i];

            rs.ready = false;
            rs.score += sd.score
            rs.numZiMo += sd.numZiMo;
            rs.numJiePao += sd.numJiePao;
            rs.numDianPao += sd.numDianPao;
            rs.numAnGang += sd.numAnGang;
            rs.numMingGang += sd.numMingGang;

            var userRT = {
                userId: sd.userId,
                actions: [],
                pengs: sd.pengs,
                wangangs: sd.wangangs,
                diangangs: sd.diangangs,
                angangs: sd.angangs,
                holds: sd.holds,
                score: sd.score,
                totalscore: rs.score,
                mingpai: sd.hasMingPai,
                firstmingpai: sd.firstMingPai,
                chajiao: sd.chajiao,
                peifu: sd.peifu,
                huinfo: sd.huInfo,
                piao: rs.dingpiao,
                detail: sd.detail,
                maima: sd.maima,
                hu: sd.hu,
            }

            for (var k in sd.actions) {
                userRT.actions[k] = {
                    type: sd.actions[k].type,
                };

                if (sd.actions[k].fan) {
                    userRT.actions[k].fan = sd.actions[k].fan;
                }
            }

            results.push(userRT);
            if (roomInfo.org_id != 0) {
                if (rs.score < roomInfo.conf.difen){difen_veriyf = true}
                update_coin(sd.userId, sd.detail.score, water_average, roomInfo.org_id);
            }
            dbresult[i] = sd.detail.score;
            delete gameSeatsOfUsers[sd.userId];
        }
        delete games[roomId];
        //console.log('测试L:', results);
        var old = roomInfo.nextButton;

        // 下一个庄家
        if (game.yipaoduoxiang >= 0) {
            roomInfo.nextButton = game.yipaoduoxiang;
        } else if (game.firstHupai >= 0) {
            roomInfo.nextButton = game.firstHupai;
        } else {
            // 荒庄不下庄
            //roomInfo.nextButton = (game.turn + 1) % game.numOfSeats;
        }

        if (old != roomInfo.nextButton) {
            db.update_next_button(roomId, roomInfo.nextButton);
        }
    }

    if (forceEnd || game == null) {
        fnNoticeResult(true);
    } else {
        //保存游戏
        store_game(game, function (ret) {
            db.update_game_result(roomInfo.uuid, game.gameIndex, dbresult);

            //记录玩家操作
            var str = JSON.stringify(game.actionList);
            db.update_game_action_records(roomInfo.uuid, game.gameIndex, str);

            //保存游戏局数
            db.update_num_of_turns(roomId, roomInfo.numOfGames);

            //如果是第一次，则扣除房卡
            if (roomInfo.numOfGames == 1) {
                var cost = 1;
                if (roomInfo.conf.maxGames == 16) {
                    cost = 2;
                }
                // 如果是社团房，扣团长的
                if (roomInfo.org_id == 0) {
                    db.cost_gems(game.gameSeats[0].userId, cost);
                } else {
                    db.cost_gems(roomInfo.conf.creator, cost);
                }

            }
            var isEnd = (roomInfo.numOfGames >= roomInfo.conf.maxGames);
            if (difen_veriyf){
                isEnd = true;
                userMgr.broacastAllInRoom('difen_reject_push', {}, roomId);
            }
            fnNoticeResult(isEnd);
        });
    }
}


async function update_coin(userid, coins, water, org_id) {
    console.log('更新金币', userid, coins, water, org_id);
    coins = parseFloat(coins - water);
    db.update_coin(userid, coins, org_id,null);
    if (water == 0) {
        return true;
    }
    // 扣茶水钱
    let parent_id = userid;
    let water_spare = water;
    let lower_ratio = 0;
    for (let index = 0; index < 3; index++) {
        let parent = await db.get_parent(org_id, parent_id);
        if (!parent || parent == null) {
            // 没有上级，直接全分给团长
            let creator = await db.get_boss_id(org_id);
            db.update_exp(creator, water_spare, org_id, null);
            break;
        }
        let water_ratio = parent.water_ratio;
        let parent_uuid = parent.uuid;
        if (index == 0 && parent.my_level <= 5){
            water_ratio = parent.my_water;
            parent_uuid = parent.my_uuid;
            parent.level = parent.my_level;
        }
        // 获取实际比例
        if (lower_ratio != 0){
            water_ratio -= lower_ratio;
        }
        lower_ratio = water_ratio;
        // 按份额分
        let coin = water_ratio * (water / 100);
        if (parent.level == 1 && index != 0) {
            // all分给团长
            coin = water_spare;
        }
        if (coin <= 0) {
            continue;
        }
        console.log(`分茶水钱: uuid: ${parent_uuid},level:${parent.level} coin: ${coin}`)
        db.update_exp(parent_uuid, coin, org_id, null);
        parent_id = parent_uuid;
        water_spare -= coin;
        if (water_spare <= 0){break;}
    }
}

function recordUserAction(game, seatData, type, target) {
    var d = { type: type, targets: [] };
    if (target != null) {
        if (typeof (target) == 'number') {
            d.targets.push(target);
        } else {
            d.targets = target;
        }
    } else {
        for (var i = 0; i < game.gameSeats.length; ++i) {
            var s = game.gameSeats[i];

            if (i != seatData.seatIndex) {
                d.targets.push(i);
            }
        }
    }

    seatData.actions.push(d);

    return d;
}

function recordGameAction(game, si, action, pai) {
    game.actionList.push(si);
    game.actionList.push(action);

    if (pai != null) {
        game.actionList.push(pai);
    }
}

exports.setReady = function (userId, callback) {
    var roomId = roomMgr.getUserRoom(userId);
    if (roomId == null) {
        return;
    }

    var roomInfo = roomMgr.getRoom(roomId);
    if (roomInfo == null) {
        return;
    }

    roomMgr.setReady(userId, true);

    var game = games[roomId];
    if (game == null) {
        if (roomInfo.seats.length == roomInfo.numOfSeats) {
            for (var i = 0; i < roomInfo.seats.length; ++i) {
                var s = roomInfo.seats[i];
                if (!s.ready || !userMgr.isOnline(s.userId)) {
                    return;
                }
            }

            //人到齐了，并且都准备好了，则开始新的一局
            exports.begin(roomId);
        }
    } else {
        var numOfMJ = game.mahjongs.length - game.currentIndex;
        var remainingGames = roomInfo.conf.maxGames - roomInfo.numOfGames;

        var data = {
            state: game.state,
            numofmj: numOfMJ,
            numOfSeats: game.numOfSeats,
            button: game.button,
            turn: game.turn,
            chuPai: game.chuPai,
        };

        data.seats = [];
        var seatData = null;
        for (var i = 0; i < game.numOfSeats; ++i) {
            var sd = game.gameSeats[i];

            var s = {
                userid: sd.userId,
                folds: sd.folds,
                angangs: sd.angangs,
                diangangs: sd.diangangs,
                wangangs: sd.wangangs,
                pengs: sd.pengs,
                que: sd.que,
                hued: sd.hued,
                huinfo: sd.huInfo,
                iszimo: sd.iszimo,
                tings: sd.tings,
                mingpai: sd.hasMingPai,
                kou: sd.kou,
                dingpiao: sd.dingpiao,
            };

            if (sd.userId == userId) {
                s.holds = sd.holds;
                seatData = sd;
            } else if (sd.hasMingPai) {
                s.holds = sd.holds;
            }

            data.seats.push(s);
        }

        //同步整个信息给客户端
        userMgr.sendMsg(userId, 'game_sync_push', data);
        sendOperations(game, seatData, game.chuPai);
    }
}

function store_single_history(userId, history) {
    db.get_user_history(userId, function (data) {
        if (data == null) {
            data = [];
        }

        while (data.length >= 10) {
            data.shift();
        }

        data.push(history);
        db.update_user_history(userId, data);
    });
}

function store_history(roomInfo) {
    var seats = roomInfo.seats;
    var history = {
        uuid: roomInfo.uuid,
        id: roomInfo.id,
        time: roomInfo.createTime,
        seats: new Array(roomInfo.numOfSeats)
    };

    for (var i = 0; i < seats.length; ++i) {
        var rs = seats[i];
        var hs = history.seats[i] = {};
        hs.userid = rs.userId;
        hs.name = crypto.toBase64(rs.name);
        hs.score = rs.score;
    }

    for (var i = 0; i < seats.length; ++i) {
        var s = seats[i];
        store_single_history(s.userId, history);
    }
}


function construct_game_base_info(game) {
    var numOfSeats = game.numOfSeats;
    var baseInfo = {
        type: game.conf.type,
        button: game.button,
        index: game.gameIndex,
        mahjongs: game.mahjongs,
        game_seats: new Array(numOfSeats),
        conf: game.conf,
    }

    for (var i = 0; i < numOfSeats; ++i) {
        baseInfo.game_seats[i] = game.gameSeats[i].holds;
    }

    game.baseInfoJson = JSON.stringify(baseInfo);
}

function store_game(game, callback) {
    db.create_game(game.roomInfo.uuid, game.gameIndex, game.baseInfoJson, callback);
}

//开始新的一局
exports.begin = async function (roomId) {
    var roomInfo = roomMgr.getRoom(roomId);
    if (roomInfo == null) {
        return;
    }

    var seats = roomInfo.seats;
    var numOfSeats = roomInfo.numOfSeats;

    var game = {
        conf: roomInfo.conf,
        roomInfo: roomInfo,
        gameIndex: roomInfo.numOfGames,

        button: roomInfo.nextButton,
        mahjongs: new Array(84),
        currentIndex: 0,
        numOfSeats: numOfSeats,
        gameSeats: new Array(numOfSeats),

        turn: 0,
        chuPai: -1,
        state: "idle",
        firstHupai: -1,
        yipaoduoxiang: -1,
        fangpaoshumu: -1,
        actionList: [],
        chupaiCnt: 0,

        continuousGangs: 0,
        firstMingPai: -1,

        baseScore: roomInfo.conf.baseScore,

        dices: [],
    };

    if (game.conf.up && roomInfo.nextUp != null) {
        game.baseScore *= (1 << roomInfo.nextUp);
    }

    roomInfo.numOfGames++;

    for (var i = 0; i < roomInfo.numOfSeats; ++i) {
        var data = game.gameSeats[i] = {};

        data.game = game;

        data.seatIndex = i;

        data.userId = seats[i].userId;
        //持有的牌
        data.holds = [];
        //打出的牌
        data.folds = [];
        //暗杠的牌
        data.angangs = [];
        //点杠的牌
        data.diangangs = [];
        //弯杠的牌
        data.wangangs = [];
        //碰了的牌
        data.pengs = [];

        //玩家手上的牌的数目，用于快速判定碰杠
        data.countMap = {};
        //玩家听牌，用于快速判定胡了的番数
        data.tingMap = {};
        data.pattern = "";

        //是否可以杠
        data.canGang = false;
        //用于记录玩家可以杠的牌
        data.gangPai = [];

        //是否可以碰
        data.canPeng = false;
        //是否可以胡
        data.canHu = false;
        //是否可以出牌
        data.canChuPai = false;

        //是否胡了
        data.hued = false;
        //
        data.actions = [];

        //是否是自摸
        data.iszimo = false;
        data.isGangHu = false;
        data.fan = 0;
        data.score = 0;
        data.huInfo = [];

        data.lastFangGangSeat = -1;

        //统计信息
        data.numZiMo = 0;
        data.numJiePao = 0;
        data.numDianPao = 0;
        data.numAnGang = 0;
        data.numMingGang = 0;

        data.hasMingPai = false;
        data.firstMingPai = false;
        data.tings = [];
        data.kou = [];

        data.hu = {};
        data.detail = {
            tips: null,
            piao: 0,
            gang: 0,
            fan: 0,
            score: 0,
        };

        data.dingpiao = seats[i].dingpiao;
        // 幸运一击
        data.lucky = 0;
        let user_data = await db.async_get_user(data.userId,0);
        if (user_data && user_data.luckyenable){
            data.lucky = user_data.luckyenable;
        }
        gameSeatsOfUsers[data.userId] = data;
    }

    games[roomId] = game;

    shuffle(game);

    dice(game);

    for (var i = 0; i < seats.length; ++i) {
        var s = seats[i];

        userMgr.sendMsg(s.userId, 'game_num_push', roomInfo.numOfGames);
        userMgr.sendMsg(s.userId, 'game_begin_push', game.button);
    }

    var notify = function () {
        var numOfMJ = game.mahjongs.length - game.currentIndex;

        for (var i = 0; i < seats.length; ++i) {
            var s = seats[i];

            userMgr.sendMsg(s.userId, 'game_holds_updated_push');
        }

        construct_game_base_info(game);

        var turnSeat = game.gameSeats[game.turn];
        userMgr.broacastInRoom('game_playing_push', null, turnSeat.userId, true);

        //进行听牌检查
        for (var i = 0; i < game.gameSeats.length; ++i) {
            var duoyu = -1;
            var gs = game.gameSeats[i];
            if (gs.holds.length == 14) {
                duoyu = gs.holds.pop();
                gs.countMap[duoyu] -= 1;
            }

            checkCanTingPai(game, gs);

            if (duoyu >= 0) {
                gs.holds.push(duoyu);
                gs.countMap[duoyu]++;
            }
        }

        game.state = "playing";
        //通知玩家出牌方
        turnSeat.canChuPai = true;
        userMgr.broacastInRoom('game_chupai_push', turnSeat.userId, turnSeat.userId, true);
        //检查是否可以暗杠或者胡
        checkCanAnGang(game, turnSeat);
        //检查胡 用最后一张来检查
        checkCanHu(game, turnSeat, turnSeat.holds[turnSeat.holds.length - 1]);

        checkCanMingPai(game, turnSeat);
        //通知前端
        sendOperations(game, turnSeat, game.chuPai);
    };

    var turnSeat = game.gameSeats[game.turn];
    userMgr.broacastInRoom('game_dice_push', game.dices, turnSeat.userId, true);
    //console.log(game.dices);

    setTimeout(function () {
        new_deal(game, notify);
    }, 1000);
};

exports.chuPai = function (userId, pai) {
    pai = Number.parseInt(pai);
    var seatData = gameSeatsOfUsers[userId];
    if (seatData == null) {
        console.log("can't find user game data.");
        return;
    }

    var game = seatData.game;
    var seatIndex = seatData.seatIndex;
    //如果不该他出，则忽略
    if (game.turn != seatData.seatIndex) {
        console.log("not your turn.");
        return;
    }

    if (!seatData.canChuPai) {
        console.log('no need chupai.');
        return;
    }
    if (game.roomInfo.dr && !game.roomInfo.dr.online[seatIndex]){
        
    }else if(hasOperations(seatData)) {
        console.log('plz guo before you chupai.');
        return;
    }

    //从此人牌中扣除
    var index = seatData.holds.indexOf(pai);
    if (index == -1) {
        console.log("holds:" + seatData.holds);
        console.log("can't find mj." + pai);
        return;
    }

    seatData.canChuPai = false;
    game.chupaiCnt++;

    seatData.holds.splice(index, 1);
    seatData.countMap[pai]--;
    game.chuPai = pai;
    recordGameAction(game, seatData.seatIndex, ACTION_CHUPAI, pai);
    checkCanTingPai(game, seatData);
    userMgr.broacastInRoom('game_chupai_notify_push', { userId: seatData.userId, pai: pai }, seatData.userId, true);

    //检查是否有人要胡，要碰 要杠
    var hasActions = false;
    var hasHu = false;
    for (var i = 0; i < game.gameSeats.length; i++) {
        if (game.turn == i) {
            continue;
        }

        var gs = game.gameSeats[i];

        checkCanPeng(game, gs, pai);
        checkCanDianGang(game, gs, pai);
        checkCanHu(game, gs, pai);

        if (hasOperations(gs)) {
            hasActions = true;
        }

        if (gs.canHu) {
            hasHu = true;
        }
        if (game.roomInfo.dr && !game.roomInfo.dr.online[i]){
            hasActions = false;
        }
    }

    for (var i = 0; i < game.gameSeats.length; i++) {
        if (game.turn == i) {
            continue;
        }

        var gs = game.gameSeats[i];
        if (gs.canHu || !hasHu) {
            sendOperations(game, gs, game.chuPai);
        }
    }


    //如果没有人有操作，则向下一家发牌，并通知他出牌
    if (!hasActions) {
        setTimeout(function () {
            userMgr.broacastInRoom('guo_notify_push', {
                userId: seatData.userId,
                pai: game.chuPai
            }, seatData.userId, true);
            seatData.folds.push(game.chuPai);
            game.chuPai = -1;
            moveToNextUser(game);
            doUserMoPai(game);
        }, 500);
    }
};

exports.peng = function (userId) {
    var seatData = gameSeatsOfUsers[userId];
    if (seatData == null) {
        console.log("can't find user game data.");
        return;
    }

    var game = seatData.game;

    //如果是他出的牌，则忽略
    if (game.turn == seatData.seatIndex) {
        console.log("it's your turn.");
        return;
    }

    //如果没有碰的机会，则不能再碰
    if (!seatData.canPeng) {
        console.log("seatData.peng == false");
        return;
    }

    //如果有人可以胡牌，则需要等待
    var i = game.turn;
    while (true) {
        var i = (i + 1) % game.numOfSeats;
        if (i == game.turn) {
            break;
        } else {
            var gs = game.gameSeats[i];
            if (gs.canHu && i != seatData.seatIndex) {
                return;
            }
        }
    }

    clearAllOptions(game);
    clearContinuousGangs(game);

    //验证手上的牌的数目
    var pai = game.chuPai;
    var c = seatData.countMap[pai];
    if (c == null || c < 2) {
        console.log("pai:" + pai + ",count:" + c);
       // console.log(seatData.holds);
        console.log("lack of mj.");
        return;
    }

    //进行碰牌处理
    //扣掉手上的牌
    //从此人牌中扣除
    for (var i = 0; i < 2; ++i) {
        var index = seatData.holds.indexOf(pai);
        if (index == -1) {
            console.log("can't find mj.");
            return;
        }

        seatData.holds.splice(index, 1);
        seatData.countMap[pai]--;
    }

    seatData.pengs.push(pai);
    game.chuPai = -1;

    recordGameAction(game, seatData.seatIndex, ACTION_PENG, pai);

    //广播通知其它玩家
    userMgr.broacastInRoom('peng_notify_push', { userid: seatData.userId, pai: pai }, seatData.userId, true);

    //碰的玩家打牌
    moveToNextUser(game, seatData.seatIndex);

    checkCanAnGang(game, seatData);
    checkCanWanGang(game, seatData);
    checkCanMingPai(game, seatData);

    //广播通知玩家出牌方
    seatData.canChuPai = true;
    userMgr.broacastInRoom('game_chupai_push', seatData.userId, seatData.userId, true);

    //通知玩家做对应操作
    sendOperations(game, seatData, game.chuPai);

};

exports.isPlaying = function (userId) {
    var seatData = gameSeatsOfUsers[userId];
    if (seatData == null) {
        return false;
    }

    var game = seatData.game;

    if (game.state == "idle") {
        return false;
    }

    return true;
}

function checkCanQiangGang(game, turnSeat, seatData, pai) {
    var hasActions = false;
    for (var i = 0; i < game.gameSeats.length; ++i) {
        //杠牌者不检查
        if (seatData.seatIndex == i) {
            continue;
        }

        var gs = game.gameSeats[i];
        checkCanHu(game, gs, pai, true);
        if (gs.canHu) {
            sendOperations(game, gs, pai);
            hasActions = true;
        }
    }

    if (hasActions) {
        game.qiangGangContext = {
            turnSeat: turnSeat,
            seatData: seatData,
            pai: pai,
            isValid: true,
        }
    } else {
        game.qiangGangContext = null;
    }

    return game.qiangGangContext != null;
}

function doGang(game, turnSeat, seatData, gangtype, numOfCnt, pai) {
    var seatIndex = seatData.seatIndex;
    var gameTurn = turnSeat.seatIndex;

    if (gangtype == "wangang") {
        var idx = seatData.pengs.indexOf(pai);
        if (idx >= 0) {
            seatData.pengs.splice(idx, 1);
        }
    }

    //进行碰牌处理
    //扣掉手上的牌
    //从此人牌中扣除
    for (var i = 0; i < numOfCnt; ++i) {
        var index = seatData.holds.indexOf(pai);
        if (index == -1) {
            //console.log(seatData.holds);
            console.log("can't find mj.");
            return;
        }

        seatData.holds.splice(index, 1);
        seatData.countMap[pai]--;
    }

    var id = seatData.kou.indexOf(pai);
    if (id !== -1) {
        seatData.kou.splice(id, 1);
    }

    recordGameAction(game, seatData.seatIndex, ACTION_GANG, pai);

    var fan = game.continuousGangs;

    var baseScore = game.baseScore;
    var times = fan ? (1 << fan) : 1;
    var ac = null;
    var roomInfo = getRoomInfo(seatData.userId);
    var myseat = roomInfo.seats[seatIndex];

    //记录下玩家的杠牌
    if (gangtype == "angang") {
        seatData.angangs.push(pai);
        ac = recordUserAction(game, seatData, "angang");
        ac.score = baseScore * 2 * times;
        if (fan > 0) {
            ac.fan = fan;
        }

        myseat.numAnGang += 1;
    } else if (gangtype == "diangang") {
        seatData.diangangs.push(pai);
        ac = recordUserAction(game, seatData, "diangang", gameTurn);
        ac.score = baseScore * 2 * times;
        if (fan > 0) {
            ac.fan = fan;
        }
        var fs = turnSeat;
        recordUserAction(game, fs, "fanggang", seatIndex);

        myseat.numMingGang += 1;
    } else if (gangtype == "wangang") {
        seatData.wangangs.push(pai);
        ac = recordUserAction(game, seatData, "wangang");
        ac.score = baseScore * times;
        if (fan > 0) {
            ac.fan = fan;
        }

        myseat.numMingGang += 1;
    }

    var scores = [0, 0, 0];
    var incoming = ac.targets.length * ac.score;

    scores[seatIndex] = incoming;
    myseat.score += incoming;
    for (var t = 0; t < ac.targets.length; ++t) {
        var si = ac.targets[t];
        var rs = roomInfo.seats[si];

        rs.score -= ac.score;
        scores[si] -= ac.score;
    }

    checkCanTingPai(game, seatData);
    //通知其他玩家，有人杠了牌
    userMgr.broacastInRoom('gang_notify_push', {
        userid: seatData.userId,
        pai: pai,
        gangtype: gangtype,
        scores: scores,
        fan: fan
    }, seatData.userId, true);

    //变成自己的轮子
    moveToNextUser(game, seatIndex);
    //再次摸牌
    doUserMoPai(game);

    //只能放在这里。因为过手就会清除杠牌标记
    seatData.lastFangGangSeat = gameTurn;
    game.continuousGangs = fan + 1;
    //console.log('杠牌了',seatData.seatIndex,seatData.lastFangGangSeat);
}

exports.ming = function (uid, data) {
    var pai = data.pai;
    var kou = data.kou;
    var sd = gameSeatsOfUsers[uid];
    if (!sd) {
        console.log("can't find user game data.");
        return;
    }

    var game = sd.game;

    if (sd.hasMingPai) {
        console.log('cannot ming again');
        return;
    }

    if (!sd.canMingPai) {
        console.log('you cant ming')
        return;
    }
    /*
        if (sd.mingPai.indexOf(pai) == -1) {
            console.log("the given pai can't be minged." + pai);
            return;
        }
    */
    clearAllOptions(game, sd);

    sd.hasMingPai = true;
    checkCanTingPai(game, sd);
    // TODO 判断有没有听牌
    sd.kou = data.kou;
    sd.mingPai = [];

    exports.chuPai(uid, pai);

    recordGameAction(game, sd.seatIndex, ACTION_MING, 0);

    var data = {
        userid: sd.userId,
        holds: sd.holds,
        kou: kou,
    };

    data.tings = getTingList(sd);

    userMgr.broacastInRoom('ming_notify_push', data, uid, true);

    console.log("ming_notify_push");
    // console.log(data.kou);
    // console.log(data.tings);
    // console.log(sd.holds);

    if (game.firstMingPai < 0) {
        game.firstMingPai = sd.seatIndex;
    }
};

exports.gang = function (userId, pai) {
    var seatData = gameSeatsOfUsers[userId];
    if (seatData == null) {
        console.log("can't find user game data.");
        return;
    }

    var seatIndex = seatData.seatIndex;
    var game = seatData.game;

    //如果没有杠的机会，则不能再杠
    if (!seatData.canGang) {
        console.log("seatData.gang == false");
        return;
    }

    var numOfCnt = seatData.countMap[pai];

    if (seatData.gangPai.indexOf(pai) == -1) {
        console.log("the given pai can't be ganged.");
        return;
    }

    //如果有人可以胡牌，则需要等待
    var i = game.turn;
    while (true) {
        var i = (i + 1) % game.numOfSeats;
        if (i == game.turn) {
            break;
        } else {
            var gs = game.gameSeats[i];
            if (gs.canHu && i != seatData.seatIndex) {
                return;
            }
        }
    }

    var gangtype = "";
    //弯杠 去掉碰牌
    if (numOfCnt == 1) {
        gangtype = "wangang"
    } else if (numOfCnt == 3) {
        gangtype = "diangang"
    } else if (numOfCnt == 4) {
        gangtype = "angang";
    } else {
        console.log("invalid pai count.");
        return;
    }

    game.chuPai = -1;
    clearAllOptions(game);
    seatData.canChuPai = false;

    userMgr.broacastInRoom('hangang_notify_push', seatIndex, seatData.userId, true);

    //如果是弯杠，则需要检查是否可以抢杠
    var turnSeat = game.gameSeats[game.turn];
    if (numOfCnt == 1) {
        var canQiangGang = checkCanQiangGang(game, turnSeat, seatData, pai);
        if (canQiangGang) {
            return;
        }
    }

    doGang(game, turnSeat, seatData, gangtype, numOfCnt, pai);
};

exports.hu = function (userId) {
    var seatData = gameSeatsOfUsers[userId];
    if (seatData == null) {
        console.log("can't find user game data.");
        return;
    }

    var seatIndex = seatData.seatIndex;
    var game = seatData.game;

    if (!seatData.canHu) {
        console.log("invalid request.");
        return;
    }

    seatData.hued = true;
    var hupai = game.chuPai;
    var isZimo = false;

    var turnSeat = game.gameSeats[game.turn];

    var huData = {
        ishupai: true,
        pai: -1,
        action: null,
        isGangHu: false,
        isQiangGangHu: false,
        iszimo: false,
        target: -1,
        fan: 0,
        pattern: null,
    };

    seatData.huInfo.push(huData);

    huData.isGangHu = turnSeat.lastFangGangSeat >= 0;
    var notify = -1;

    if (game.qiangGangContext != null) {
        hupai = game.qiangGangContext.pai;
        var gangSeat = game.qiangGangContext.seatData;
        notify = hupai;
        huData.iszimo = false;
        huData.action = "qiangganghu";
        huData.isQiangGangHu = true;
        huData.target = gangSeat.seatIndex;
        huData.pai = hupai;

        recordGameAction(game, seatIndex, ACTION_HU, hupai);
        game.qiangGangContext.isValid = false;

        gangSeat.huInfo.push({
            action: "beiqianggang",
            target: seatData.seatIndex,
            index: seatData.huInfo.length - 1,
        });
    } else if (game.chuPai == -1) {
        hupai = seatData.holds.pop();
        seatData.countMap[hupai]--;
        notify = hupai;
        huData.pai = hupai;
        if (huData.isGangHu) {
            huData.action = "ganghua";
            huData.iszimo = true;
            /* TODO
                        if(turnSeat.lastFangGangSeat == seatIndex){
                            huData.action = "ganghua";
                            huData.iszimo = true;
                        } else {
                            console.log('dianganghua');
                            var diangganghua_zimo = game.conf.dianganghua == 1;
                            huData.action = "dianganghua";
                            huData.iszimo = diangganghua_zimo;
                            huData.target = turnSeat.lastFangGangSeat;
                        }
            */
        } else {
            huData.action = "zimo";
            huData.iszimo = true;
        }

        isZimo = true;
        recordGameAction(game, seatIndex, ACTION_ZIMO, hupai);
    } else {
        notify = game.chuPai;
        huData.pai = hupai;

        var at = "hu";
        //炮胡
        if (turnSeat.lastFangGangSeat >= 0) {
            at = "gangpaohu";
        }

        huData.action = at;
        huData.iszimo = false;
        huData.target = game.turn;

        //记录玩家放炮信息
        var fs = game.gameSeats[game.turn];
        if (at == "gangpaohu") {
            at = "gangpao";
        } else {
            at = "fangpao";
        }

        fs.huInfo.push({
            action: at,
            target: seatData.seatIndex,
            index: seatData.huInfo.length - 1,
        });

        recordGameAction(game, seatIndex, ACTION_HU, hupai);

        game.fangpaoshumu++;

        if (game.fangpaoshumu > 1) {
            game.yipaoduoxiang = game.turn;
        }
    }

    if (game.firstHupai < 0) {
        game.firstHupai = seatIndex;
    }

    //保存番数
    var ti = seatData.tingMap[hupai];
    huData.fan = ti.fan;
    huData.pattern = ti.pattern;
    huData.iszimo = isZimo;

    seatData.isHaiDiHu = game.currentIndex == game.mahjongs.length;

    var maima = null;
   
    
    var mysym_func = (pai)=>{
        if (pai == 0 ) {
            // 1筒
           return Math.floor(Math.random() * 26) + 1
        }else if (pai ==9){
            // 1条 
             let ma_pai = Math.floor(Math.random() * 27);
             if (ma_pai == 9){
                 ma_pai++;
             }
             return ma_pai;
        }
        return false;
    }

    if (isZimo) {
        console.debug('debug-maima:',game.conf.maima,seatData.hasMingPai)
        if (game.conf.maima == 1 || (game.conf.maima >= 2 && seatData.hasMingPai)) {
            var pai = maiMa(game);
            console.log('maima: ' + pai);
            if (pai > 0) {
                maima = [{
                    pai: pai,
                    fan: getMaScore(pai) * game.baseScore,
                }];
                if (game.conf.mysym){
                    let maima_pai = mysym_func(pai);
                    if (maima_pai){
                        maima.push({
                            pai: maima_pai,
                            fan: getMaScore(maima_pai) * game.baseScore,
                        })
                    }
                }
                seatData.maima = maima;
            }
        }
    }

    clearAllOptions(game, seatData);

    //通知前端，有人和牌了
    var data = {
        seatindex: seatIndex,
        iszimo: isZimo,
        hupai: notify,
        holds: seatData.holds,
    };

    userMgr.broacastInRoom('hu_push', data, seatData.userId, true);

    if (game.lastHuPaiSeat == -1) {
        game.lastHuPaiSeat = seatIndex;
    }

    //清空所有非胡牌操作
    for (var i = 0; i < game.gameSeats.length; ++i) {
        var gs = game.gameSeats[i];
        gs.canPeng = false;
        gs.canGang = false;
        gs.canChuPai = false;
        sendOperations(game, gs, hupai);
    }

    //如果还有人可以胡牌，则等待
    for (var i = 0; i < game.gameSeats.length; ++i) {
        var gs = game.gameSeats[i];
        if (gs.canHu) {
            return;
        }
    }

    // 结束本局
    doGameOver(game, userId);
};

exports.guo = function (userId) {
    var seatData = gameSeatsOfUsers[userId];
    if (seatData == null) {
        console.log("can't find user game data.");
        return;
    }

    var seatIndex = seatData.seatIndex;
    var game = seatData.game;

    //如果玩家没有对应的操作，则也认为是非法消息
    if (!hasOperations(seatData)) {
        console.log("no need guo.");
        return;
    }

    //如果是玩家自己的轮子，不是接牌，则不需要额外操作
    var doNothing = game.chuPai == -1 && game.turn == seatIndex;

    userMgr.sendMsg(seatData.userId, "guo_result");
    let lastFangGangSeat = seatData.lastFangGangSeat;
    clearAllOptions(game, seatData);
    seatData.lastFangGangSeat = lastFangGangSeat;
    if (doNothing) {
        return;
    }

    // 如果一炮多响，第二个胡牌的人选择了过，应该结束游戏
    if (game.firstHupai >= 0) {
        doGameOver(game, userId);
        return;
    }

    for (var i = 0; i < game.gameSeats.length; ++i) {
        var gs = game.gameSeats[i];
        if (hasOperations(gs)) {
            if (!gs.canHu) {
                sendOperations(game, gs, game.chuPai);
            }

            return;
        }
    }

    //如果是已打出的牌，则需要通知
    if (game.chuPai >= 0) {
        var uid = game.gameSeats[game.turn].userId;
        userMgr.broacastInRoom('guo_notify_push', { userId: uid, pai: game.chuPai }, seatData.userId, true);

        var gs = game.gameSeats[game.turn];
        gs.folds.push(game.chuPai);
        game.chuPai = -1;
    }

    var qiangGangContext = game.qiangGangContext;
    //清除所有的操作
    clearAllOptions(game);

    if (qiangGangContext != null && qiangGangContext.isValid) {
        doGang(game, qiangGangContext.turnSeat, qiangGangContext.seatData, "wangang", 1, qiangGangContext.pai);
    } else {
        //下家摸牌
        moveToNextUser(game);
        doUserMoPai(game);
    }
};

exports.hasBegan = function (roomId) {
    var game = games[roomId];
    if (game != null) {
        return true;
    }

    var roomInfo = roomMgr.getRoom(roomId);
    if (roomInfo != null) {
        return roomInfo.numOfGames > 0;
    }

    return false;
};


var dissolvingList = [];

exports.doDissolve = function (roomId) {
    var roomInfo = roomMgr.getRoom(roomId);
    if (roomInfo == null) {
        return null;
    }

    var game = games[roomId];
    doGameOver(game, roomInfo.seats[0].userId, true);
};

exports.dissolveUpdate = function (roomId, userId, online) {
    var roomInfo = roomMgr.getRoom(roomId);
    if (roomInfo == null) {
        return null;
    }

    var seatIndex = roomMgr.getUserSeatId(userId);
    if (seatIndex == null) {
        return null;
    }

    var dr = roomInfo.dr;

    if (dr == null) {
        if (!online) {
            return exports.dissolveRequest(roomId, userId, true);
        } else {
            return null;
        }
    }

    dr.online[seatIndex] = online;

    var found = false;
    var reject = -1;
    for (var i = 0; i < dr.online.length; i++) {
        if (!dr.online[i]) {
            found = true;
        }

        if (dr.states[i] == 1) {
            reject = roomInfo.seats[i].userId;
        }
    }

    if (!found) {
        if (dr.reason == 'offline' || reject >= 0) {
            if (reject >= 0) {
                roomInfo.rejectUser = reject;
            }

            roomInfo.dr = null;
            var idx = dissolvingList.indexOf(roomId);
            if (idx != -1) {
                dissolvingList.splice(idx, 1);
            }
        }
    }

    return roomInfo;
};

exports.dissolveRequest = function (roomId, userId, offline) {
    var roomInfo = roomMgr.getRoom(roomId);
    if (roomInfo == null) {
        return null;
    }

    var seatIndex = roomMgr.getUserSeatId(userId);
    if (seatIndex == null) {
        return null;
    }

    var dr = roomInfo.dr;

    if (dr != null) {
        if (dr.reason == 'offline' && !offline) {
            dr.endTime = Date.now() + 600000;
            dr.reason = 'request';
            dr.states[seatIndex] = 3;
        } else {
            return null;
        }
    } else {
        dr = {
            endTime: Date.now() + 600000,
            states: new Array(roomInfo.numOfSeats),
            online: [true, true, true],
        };
        for (let index = 0; index < dr.states.length; index++) {
            dr.states[index] = 0;
        }

        if (offline) {
            dr.reason = 'offline';
            dr.online[seatIndex] = false;
        } else {
            dr.reason = 'request';
            dr.states[seatIndex] = 3;
        }

        roomInfo.dr = dr;
        dissolvingList.push(roomId);
    }

    return roomInfo;
};

exports.dissolveAgree = function (roomId, userId, agree) {
    var roomInfo = roomMgr.getRoom(roomId);
    if (roomInfo == null) {
        return null;
    }

    var dr = roomInfo.dr;
    if (dr == null) {
        return null;
    }

    var seatIndex = roomMgr.getUserSeatId(userId);
    if (seatIndex == null) {
        return null;
    }

    if (agree) {
        dr.states[seatIndex] = 2;
        var count = 0;
        for (var i = 0; i < dr.states.length; i++) {
            if (dr.states[i] >= 2) {
                count++;
            }
        }

        if (2 == count) {
            dr.endTime = Date.now() + 300000;
        }
    } else {
        dr.states[seatIndex] = 1;

        var found = false;
        for (var i = 0; i < dr.online.length; i++) {
            if (!dr.online[i]) {
                found = true;
                break;
            }
        }

        if (!found) {
            roomInfo.dr = null;
            var idx = dissolvingList.indexOf(roomId);
            if (idx != -1) {
                dissolvingList.splice(idx, 1);
            }
        }
    }

    return roomInfo;
};

function update() {
    for (var i = dissolvingList.length - 1; i >= 0; --i) {
        var roomId = dissolvingList[i];

        var roomInfo = roomMgr.getRoom(roomId);
        if (roomInfo != null && roomInfo.dr != null) {
            if (Date.now() > roomInfo.dr.endTime) {
                console.log("delete room and games");
                exports.doDissolve(roomId);
                dissolvingList.splice(i, 1);
            }
        } else {
            dissolvingList.splice(i, 1);
        }
    }
}

setInterval(update, 1000);

exports.parseConf = function (roomConf, conf) {
    conf.dingpiao = !roomConf.dingpiao ? 0 : roomConf.dingpiao;
    if (roomConf.dingpiao == 2){
        conf.dingpiao = 1;
    }
    if (conf.dingpiao == 3){
        conf.dingpiao = 2;
    }
    conf.maima = roomConf.maima || 0;

    var type = roomConf.type;
    if (type == 'xykwx') {
        conf.pindao = roomConf.pindao || 0;
    } else if (type == 'xgkwx') {
        conf.shukan = roomConf.shukan;
        conf.chkming = roomConf.chkming;
    } else if (type == 'szkwx') {
        conf.partming = roomConf.partming;
    } else if (type == 'sykwx') {
        conf.pindao = roomConf.pindao || 0;
        conf.up = roomConf.up;
        conf.chajiao = roomConf.chajiao;
    } else if (type == 'yckwx') {
        conf.pqmb = roomConf.pqmb;
        conf.mysym = roomConf.mysym || false;
    }
    conf.ipForbid = roomConf.ipForbid;
    conf.second9 = roomConf.second9;
    conf.people = roomConf.people || 3;
    conf.difen = roomConf.difen || 2;
    conf.pump = roomConf.pump || 0;
}

exports.checkConf = function () {
    return true;
}


