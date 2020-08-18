var mysql = require("mysql");
var crypto = require('./crypto');
const { resolve } = require("path");

var pool = null;

function nop(a, b, c, d, e, f, g) {

}

function query(sql, callback) {
    pool.getConnection(function (err, conn) {
        if (err) {
            callback(err, null, null);
        } else {
            conn.query(sql, function (qerr, vals, fields) {
                //释放连接  
                conn.release();
                //事件驱动回调  
                callback(qerr, vals, fields);
            });
        }
    });
};

exports.init = function (config) {
    pool = mysql.createPool({
        host: config.HOST,
        user: config.USER,
        password: config.PSWD,
        database: config.DB,
        port: config.PORT,
    });
};

exports.is_account_exist = function (account, callback) {
    callback = callback == null ? nop : callback;
    if (account == null) {
        callback(false);
        return;
    }

    var sql = 'SELECT * FROM t_accounts WHERE account = "' + account + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            if (rows.length > 0) {
                callback(true);
            } else {
                callback(false);
            }
        }
    });
};

exports.create_account = function (account, password, callback) {
    callback = callback == null ? nop : callback;
    if (account == null || password == null) {
        callback(false);
        return;
    }

    var psw = crypto.md5(password);
    var sql = 'INSERT INTO t_accounts(account,password) VALUES("' + account + '","' + psw + '")';
    query(sql, function (err, rows, fields) {
        if (err) {
            if (err.code == 'ER_DUP_ENTRY') {
                callback(false);
                return;
            }
            callback(false);
            throw err;
        } else {
            callback(true);
        }
    });
};

exports.get_account_info = function (account, password, type, callback) {
    callback = callback == null ? nop : callback;
    if (account == null) {
        callback(null);
        return;
    }
    if (type == 2) {
        var sql = 'SELECT * FROM t_users WHERE mobile = "' + account + '"';
    } else {
        var sql = 'SELECT * FROM t_accounts WHERE account = "' + account + '"';
    }
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        }

        if (rows.length == 0) {
            callback(null);
            return;
        }

        // if (password != null) {
        //     var psw = crypto.md5(password);
        //     if (rows[0].password == psw) {
        //         callback(null);
        //         return;
        //     }
        // }

        callback(rows[0]);
    });
};

exports.is_user_exist = function (account, callback) {
    callback = callback == null ? nop : callback;
    if (account == null) {
        callback(false);
        return;
    }

    var sql = 'SELECT userid FROM t_users WHERE account = "' + account + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            throw err;
        }

        if (rows.length == 0) {
            callback(false);
            return;
        }

        callback(true);
    });
}


exports.get_user_data = function (account, callback) {
    callback = callback == null ? nop : callback;
    if (account == null) {
        callback(null);
        return;
    }

    var sql = 'SELECT * FROM t_users WHERE account = "' + account + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        }

        if (rows.length == 0) {
            callback(null);
            return;
        }
        rows[0].name = crypto.fromBase64(rows[0].name);
        callback(rows[0]);
    });
};

exports.get_user_data_by_userid = function (userid, callback) {
    callback = callback == null ? nop : callback;
    if (userid == null) {
        callback(null);
        return;
    }

    var sql = 'SELECT userid,account,name,lv,exp,coins,gems,roomid FROM t_users WHERE userid = ' + userid;
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        }

        if (rows.length == 0) {
            callback(null);
            return;
        }
        rows[0].name = crypto.fromBase64(rows[0].name);
        callback(rows[0]);
    });
};

/**增加玩家房卡 */
exports.add_user_gems = function (userid, gems, callback) {
    callback = callback == null ? nop : callback;
    if (userid == null) {
        callback(false);
        return;
    }

    var sql = 'UPDATE t_users SET gems = gems +' + gems + ' WHERE userid = ' + userid;
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            console.log(err);
            callback(false);
            return;
        } else {
            callback(rows.affectedRows > 0);
            return;
        }
    });
};

exports.get_gems = function (account, callback) {
    callback = callback == null ? nop : callback;
    if (account == null) {
        callback(null);
        return;
    }

    var sql = 'SELECT gems FROM t_users WHERE account = "' + account + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        }

        if (rows.length == 0) {
            callback(null);
            return;
        }

        callback(rows[0]);
    });
};

exports.get_user_history = function (userId, callback) {
    callback = callback == null ? nop : callback;
    if (userId == null) {
        callback(null);
        return;
    }

    var sql = 'SELECT history FROM t_users WHERE userid = "' + userId + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        }

        if (rows.length == 0) {
            callback(null);
            return;
        }
        var history = rows[0].history;
        if (history == null || history == "") {
            callback(null);
        } else {
            console.log(history.length);
            history = JSON.parse(history);
            callback(history);
        }
    });
};

exports.update_user_history = function (userId, history, callback) {
    callback = callback == null ? nop : callback;
    if (userId == null || history == null) {
        callback(false);
        return;
    }

    history = JSON.stringify(history);
    var sql = 'UPDATE t_users SET roomid = null, history = \'' + history + '\' WHERE userid = "' + userId + '"';
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        }

        if (rows.length == 0) {
            callback(false);
            return;
        }

        callback(true);
    });
};

exports.get_games_of_room = function (room_uuid, callback) {
    callback = callback == null ? nop : callback;
    if (room_uuid == null) {
        callback(null);
        return;
    }

    var sql = 'SELECT game_index,create_time,result FROM t_games_archive WHERE room_uuid = "' + room_uuid + '"';
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        }

        if (rows.length == 0) {
            callback(null);
            return;
        }

        callback(rows);
    });
};

exports.get_detail_of_game = function (room_uuid, index, callback) {
    callback = callback == null ? nop : callback;
    if (room_uuid == null || index == null) {
        callback(null);
        return;
    }
    var sql = 'SELECT base_info,action_records FROM t_games_archive WHERE room_uuid = "' + room_uuid + '" AND game_index = ' + index;
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        }

        if (rows.length == 0) {
            callback(null);
            return;
        }
        callback(rows[0]);
    });
}

exports.create_user = function (account, name, coins, gems, sex, headimg, callback) {
    callback = callback == null ? nop : callback;
    if (account == null || name == null || coins == null || gems == null) {
        callback(false);
        return;
    }
    if (headimg) {
        headimg = '"' + headimg + '"';
    } else {
        headimg = 'null';
    }
    name = crypto.toBase64(name);
    var sql = 'INSERT INTO t_users(account,name,coins,gems,sex,headimg) VALUES("{0}","{1}",{2},{3},{4},{5})';
    sql = sql.format(account, name, coins, gems, sex, headimg);
    console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            throw err;
        }
        callback(true);
    });
};

exports.update_user_info = function (userid, name, headimg, sex, callback) {
    callback = callback == null ? nop : callback;
    if (userid == null) {
        callback(null);
        return;
    }

    if (headimg) {
        headimg = '"' + headimg + '"';
    } else {
        headimg = 'null';
    }
    name = crypto.toBase64(name);
    var sql = 'UPDATE t_users SET name="{0}",headimg={1},sex={2} WHERE account="{3}"';
    sql = sql.format(name, headimg, sex, userid);
    console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            throw err;
        }
        callback(rows);
    });
};

exports.get_user_base_info = function (userid, callback) {
    callback = callback == null ? nop : callback;
    if (userid == null) {
        callback(null);
        return;
    }
    var sql = 'SELECT name,sex,headimg FROM t_users WHERE userid={0}';
    sql = sql.format(userid);
    ////console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            throw err;
        }
        if (rows.length == 0) {
            callback(null);
            return;
        }
        rows[0].name = crypto.fromBase64(rows[0].name);
        callback(rows[0]);
    });
};

exports.is_room_exist = function (roomId, callback) {
    callback = callback == null ? nop : callback;
    var sql = 'SELECT * FROM t_rooms WHERE id = "' + roomId + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(rows.length > 0);
        }
    });
};

exports.cost_gems = function (userid, cost, callback) {
    callback = callback == null ? nop : callback;
    var sql = 'UPDATE t_users SET gems = gems -' + cost + ' WHERE userid = ' + userid;
    console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(rows.length > 0);
        }
    });
};

exports.set_room_id_of_user = function (userId, roomId, callback) {
    callback = callback == null ? nop : callback;
    if (roomId != null) {
        roomId = '"' + roomId + '"';
    }
    var sql = 'UPDATE t_users SET roomid = ' + roomId + ' WHERE userid = "' + userId + '"';
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            console.log(err);
            callback(false);
            throw err;
        } else {
            callback(rows.length > 0);
        }
    });
};

exports.get_room_id_of_user = function (userId, callback) {
    callback = callback == null ? nop : callback;
    var sql = 'SELECT roomid FROM t_users WHERE userid = "' + userId + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        } else {
            if (rows.length > 0) {
                callback(rows[0].roomid);
            } else {
                callback(null);
            }
        }
    });
};

exports.create_room = function (roomId, conf, org_id, ip, port, create_time, callback) {
    callback = callback == null ? nop : callback;
    var sql = "INSERT INTO t_rooms(uuid,id,base_info,ip,port,create_time,org_id) \
                VALUES('{0}','{1}','{2}','{3}',{4},{5},{6})";
    var uuid = Date.now() + roomId;
    var baseInfo = JSON.stringify(conf);
    sql = sql.format(uuid, roomId, baseInfo, ip, port, create_time, org_id);
    //console.log(sql);
    query(sql, function (err, row, fields) {
        if (err) {
            callback(null);
            throw err;
        } else {
            callback(uuid);
        }
    });
};

exports.get_room_uuid = function (roomId, callback) {
    callback = callback == null ? nop : callback;
    var sql = 'SELECT uuid FROM t_rooms WHERE id = "' + roomId + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        } else {
            if (rows.length > 0) {
                callback(rows[0].uuid);
            } else {
                callback(null);
            }
        }
    });
};

exports.update_seat_info = function (roomId, seatIndex, userId, icon, name, callback) {
    callback = callback == null ? nop : callback;
    var sql = 'UPDATE t_rooms SET user_id{0} = {1},user_icon{0} = "{2}",user_name{0} = "{3}" WHERE id = "{4}"';
    name = crypto.toBase64(name);
    sql = sql.format(seatIndex, userId, icon, name, roomId);
    //console.log(sql);
    query(sql, function (err, row, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(true);
        }
    });
}

exports.update_num_of_turns = function (roomId, numOfTurns, callback) {
    callback = callback == null ? nop : callback;
    var sql = 'UPDATE t_rooms SET num_of_turns = {0} WHERE id = "{1}"'
    sql = sql.format(numOfTurns, roomId);
    //console.log(sql);
    query(sql, function (err, row, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(true);
        }
    });
};


exports.update_next_button = function (roomId, nextButton, callback) {
    callback = callback == null ? nop : callback;
    var sql = 'UPDATE t_rooms SET next_button = {0} WHERE id = "{1}"'
    sql = sql.format(nextButton, roomId);
    //console.log(sql);
    query(sql, function (err, row, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(true);
        }
    });
};

exports.get_room_addr = function (roomId, callback) {
    callback = callback == null ? nop : callback;
    if (roomId == null) {
        callback(false, null, null);
        return;
    }

    var sql = 'SELECT ip,port FROM t_rooms WHERE id = "' + roomId + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false, null, null);
            throw err;
        }
        if (rows.length > 0) {
            callback(true, rows[0].ip, rows[0].port);
        } else {
            callback(false, null, null);
        }
    });
};

exports.get_room_data = function (roomId, callback) {
    callback = callback == null ? nop : callback;
    if (roomId == null) {
        callback(null);
        return;
    }

    var sql = 'SELECT * FROM t_rooms WHERE id = "' + roomId + '"';
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        }
        if (rows.length > 0) {
            rows[0].user_name0 = crypto.fromBase64(rows[0].user_name0);
            rows[0].user_name1 = crypto.fromBase64(rows[0].user_name1);
            rows[0].user_name2 = crypto.fromBase64(rows[0].user_name2);
            rows[0].user_name3 = crypto.fromBase64(rows[0].user_name3);
            callback(rows[0]);
        } else {
            callback(null);
        }
    });
};

exports.delete_room = function (roomId, callback) {
    callback = callback == null ? nop : callback;
    if (roomId == null) {
        callback(false);
    }
    var sql = "DELETE FROM t_rooms WHERE id = '{0}'";
    sql = sql.format(roomId);
    console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(true);
        }
    });
}

exports.get_room_list = function (org_id, callback) {
    callback = callback == null ? nop : callback;
    var sql = `SELECT * FROM t_rooms WHERE org_id =${org_id} order by create_time desc`;
    query(sql, function (err, rows, fields) {
        if (err) {
            callback({});
            throw err;
        }
        if (rows.length > 0) {
            for (const key in rows) {
                if (rows.hasOwnProperty(key)) {
                    rows[key].user_name0 = crypto.fromBase64(rows[0].user_name0);
                    rows[key].user_name1 = crypto.fromBase64(rows[0].user_name1);
                    rows[key].user_name2 = crypto.fromBase64(rows[0].user_name2);
                    rows[key].user_name3 = crypto.fromBase64(rows[0].user_name3);
                }
            }
            callback(rows);
        } else {
            callback({});
        }
    });
};

exports.create_game = function (room_uuid, index, base_info, callback) {
    callback = callback == null ? nop : callback;
    var sql = "INSERT INTO t_games(room_uuid,game_index,base_info,create_time) VALUES('{0}',{1},'{2}',unix_timestamp(now()))";
    sql = sql.format(room_uuid, index, base_info);
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(null);
            throw err;
        } else {
            callback(rows.insertId);
        }
    });
};

exports.delete_games = function (room_uuid, callback) {
    callback = callback == null ? nop : callback;
    if (room_uuid == null) {
        callback(false);
    }
    var sql = "DELETE FROM t_games WHERE room_uuid = '{0}'";
    sql = sql.format(room_uuid);
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(true);
        }
    });
}

exports.archive_games = function (room_uuid, callback) {
    callback = callback == null ? nop : callback;
    if (room_uuid == null) {
        callback(false);
    }
    var sql = "INSERT INTO t_games_archive(SELECT * FROM t_games WHERE room_uuid = '{0}')";
    sql = sql.format(room_uuid);
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            exports.delete_games(room_uuid, function (ret) {
                callback(ret);
            });
        }
    });
}

exports.update_game_action_records = function (room_uuid, index, actions, callback) {
    callback = callback == null ? nop : callback;
    var sql = "UPDATE t_games SET action_records = '" + actions + "' WHERE room_uuid = '" + room_uuid + "' AND game_index = " + index;
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(true);
        }
    });
};

exports.update_game_result = function (room_uuid, index, result, callback) {
    callback = callback == null ? nop : callback;
    if (room_uuid == null || result) {
        callback(false);
    }
    result = JSON.stringify(result);
    var sql = "UPDATE t_games SET result = '" + result + "' WHERE room_uuid = '" + room_uuid + "' AND game_index = " + index;
    //console.log(sql);
    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            callback(true);
        }
    });
};

exports.get_message = function (type, version, callback) {
    callback = callback == null ? nop : callback;

    var sql = 'SELECT * FROM t_message WHERE type = "' + type + '"';

    if (version == "null") {
        version = null;
    }

    if (version) {
        version = '"' + version + '"';
        sql += ' AND version != ' + version;
    }

    query(sql, function (err, rows, fields) {
        if (err) {
            callback(false);
            throw err;
        } else {
            if (rows.length > 0) {
                callback(rows[0]);
            } else {
                callback(null);
            }
        }
    });
};


exports.update_coin = function (uuid, coin, org_id, callback) {
    callback = callback == null ? nop : callback;
    if (coin == 0){
        callback(true);
    }
    let sql = `update user_organization set score = score+${coin} where uuid=${uuid} and org_id = ${org_id}`;
    console.log(sql);
    query(sql, function (err, rows) {
        if (rows.affectedRows > 0) {
            callback(true);
        } else {
            callback(false);
        }
    });
}

exports.update_exp = function (uuid, exp, org_id, callback) {
    callback = callback == null ? nop : callback;
    if (exp == 0){
        callback(true);
    }
    let sql = `update user_organization set goal = goal+${exp} where uuid=${uuid} and org_id = ${org_id}`;
    console.log(sql);
    query(sql, function (err, rows) {
        if (rows.affectedRows > 0) {
            callback(true);
        } else {
            callback(false);
        }
    });
}

exports.update_rank = function (to_uuid,uuid, level, org_id, callback) {
    callback = callback == null ? nop : callback;
    let sql = `update user_organization set level=${level} ,parent_uuid=${uuid} where uuid=${to_uuid} and org_id=${org_id}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        if (rows.affectedRows > 0) {
            callback(true);
        } else {
            callback(null);
        }
    });
}

exports.join_org = function (uuid, org_id, parent_id, callback) {
    callback = callback == null ? nop : callback;
    let sql = `INSERT INTO user_organization(uuid, org_id, parent_uuid) VALUES (${uuid},${org_id},${parent_id})`
    //console.log(sql);
    query(sql, function (err, rows) {
        if (err) {
            callback(false)
        } else {
            callback(true);
        }

    });
}


exports.join_org_find = function (uuid, org_id, parent_id, callback) {
    callback = callback == null ? nop : callback;
    let sql = `select * from user_organization where uuid=${uuid} and org_id = ${org_id} and type!=3`
    //console.log(sql);
    query(sql, function (err, rows) {
        if (err) {
            callback(false)
        } else {
            if (rows.length > 0) {
                callback(true);
            } else {
                callback(false);
            }
        }

    });
}

exports.join_org_list = function (org_id, callback) {
    callback = callback == null ? nop : callback;
    let sql = `select a.*,b.name from user_organization a left join t_users b on b.userid = a.uuid where a.org_id = ${org_id} and a.type=2`;
    //console.log(sql);
    query(sql, function (err, res) {
        if (err) {
            return callback(false)
        } else {
            callback(res);
        }

    });
}

exports.join_org_approval = function (org_id, uuid, state, callback) {
    callback = callback == null ? nop : callback;
    let sql = `update user_organization set type =${state} where uuid=${uuid} and org_id=${org_id}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        if (rows.affectedRows > 0) {
            callback(true);
        } else {
            callback(false);
        }
    });
}

exports.set_org_notice = function (org_id, notice, callback) {
    callback = callback == null ? nop : callback;
    let sql = `update organization set notice ='${notice}' where id=${org_id}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(true);
    });
}

exports.get_org_info = function (org_id, callback) {
    callback = callback == null ? nop : callback;
    let sql = `select * from organization where id = ${org_id} `;
    //console.log(sql);
    query(sql, function (err, rows) {
        if (err) {
            callback(false)
        } else {
            callback(rows);
        }
    });
}

exports.set_org_info = function (org_id, func_type_1, func_type_2, show_type, pump, room_config, callback) {
    callback = callback == null ? nop : callback;
    let sql = `update organization set func_type_1 =${func_type_1},func_type_2=${func_type_2},show_type=${show_type},pump=${pump},room_config='${room_config}' where id=${org_id}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        if (err) {
            console.error(err);
            callback(false)
        } else {
            callback(true);
        }
    });
}

exports.set_org_conf = function (org_id, room_config, callback) {
    callback = callback == null ? nop : callback;
    let sql = `update organization set room_config='${room_config}' where id=${org_id}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        if (err) {
            console.error(err);
            callback(false)
        } else {
            callback(true);
        }
    });
}


exports.org_create = (name, uuid, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `INSERT INTO organization (name,boss_uuid) VALUES ('${name}',${uuid})`;
    query(sql, (err, rows) => {
        if (err) {
            callback(null);
            throw err;
        }
        let sql = `INSERT INTO user_organization(uuid, org_id, type, level) VALUES (${uuid},${rows.insertId},1,1)`
        //console.log(sql);
        query(sql, function (err, rows) {
            callback(true);
        });
    })
}

exports.org_self = (uuid, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `select b.*,a.level from user_organization a left join organization b on a.org_id=b.id where b.status=1 and a.type=1 and a.uuid = ${uuid} `;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(rows);
    });
}

exports.org_user_list = (org_id, uuid, type, callback) => {
    callback = callback == null ? nop : callback;
    let where = `a.org_id=${org_id}`;
    if (uuid) {
        where += ` and a.uuid = ${uuid}`;
    }
    if (type == 2) {
        where += ` and a.parent_uuid =0`
    }
    let sql = `select a.*,b.name,a.score as coins from user_organization a left join t_users b on b.userid = a.uuid where  ${where} and a.type=1`;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(rows);
    });
}

exports.org_delete = (org_id, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `delete from user_organization where org_id = ${org_id} `;
    //console.log(sql);
    query(sql, function (err, rows) {
        let sqls = `delete from organization where id = ${org_id}`;
        query(sqls, function (err, rows) {
            callback(true);
        });
    });
}

exports.org_quit = (org_id, uuid, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `delete from user_organization where org_id = ${org_id} and uuid = ${uuid}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        if (err) {
            callback(false);
        } else {
            callback(true);
        }
    });
}

exports.org_pump_config = (org_id, uuid, water, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `update user_organization set water_ratio =${water} where org_id=${org_id} and uuid=${uuid}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(true);
    });
}

exports.org_parent_config = (org_id, uuid, parent_id, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `update user_organization set parent_uuid =${parent_id} where org_id=${org_id} and uuid=${uuid}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(true);
    });
}

exports.add_captcha = (mobile, code, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `INSERT INTO captcha(mobile, code) VALUES (${mobile},${code})`
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(true);
    });
}


exports.delete_captcha = (mobile) => {
    let sql = `DELETE FROM captcha WHERE mobile=${mobile}`;
    query(sql, function (err, rows) {
    });
}

exports.update_coin_log = (parent_uuid,uuid,coins,org_id) => {
    let sql = `INSERT INTO update_coin_log(operator_id, uuid, org_id, coins) VALUES (${parent_uuid},${uuid},${org_id},${coins})`
    //console.log(sql);s
    query(sql, function (err, rows) {});
}

exports.get_water = async (org_id) => {
    return new Promise((resolve, reject) => {
        let sql = `select pump from organization where id=${org_id} limit 1`;
        //console.log(sql);
        query(sql, function (err, rows) {
            if (err) {
                return resolve(0);
            }
            if (rows.length > 0) {
                resolve(rows[0].pump);
            } else {
                resolve(0);
            }
        });
    })
}

exports.get_parent = async (org_id, uuid) => {
    return new Promise((resolve, reject) => {
        let sql = `select b.*,a.level as my_level,a.water_ratio as my_water,a.uuid as my_uuid from user_organization a left join user_organization b on a.parent_uuid=b.uuid
               where a.uuid=${uuid} and b.org_id=${org_id}  limit 1`;
        //console.log(sql);
        query(sql, function (err, rows) {
            if (rows) {
                return resolve(rows[0]);
            } else {
                return resolve(null);
            }
        });
    })
}

exports.org_duibi_dengji = async (org_id, uuid, to_uuid) => {
    return new Promise((resolve, reject) => {
        let sql = `select level from user_organization where uuid=${uuid} and org_id=${org_id} and level < (select level ` +
            `from user_organization where uuid=${to_uuid} and org_id=${org_id})`;
        //console.log(sql);
        query(sql, function (err, rows) {
            //console.log(rows)
            if (err) {
                return reject(err);
            }
            if (rows) {
                return resolve(1);
            } else {
                return resolve(0);
            }
        });
    })
}


exports.async_get_user = async (uuid, org_id) => {
    return new Promise((resolve, reject) => {
        if (org_id != 0){
            var sql = `SELECT a.userid,a.account,a.name,a.mobile,a.headimg,b.score as coins,b.level FROM t_users a left join user_organization b on a.userid=b.uuid WHERE a.userid=${uuid} and b.org_id=${org_id} limit 1`;
        }else{
            var sql = `SELECT * FROM t_users WHERE userid =${uuid} limit 1`;
        }
        query(sql, function (err, rows, fields) {
            if (err) {
                reject(err);
            } else {
                if (rows.length > 0) {
                    resolve(rows[0]);
                } else {
                    resolve(null)
                }
            }
        });
    })
};

exports.async_uuid_getUser = async (userid, org_id) => {
    return new Promise((resolve, reject) => {
        var sql = `SELECT a.*,b.* FROM t_users a left join user_organization b on a.userid=b.uuid WHERE a.userid =${userid} and b.org_id = ${org_id} limit 1`;
        query(sql, function (err, rows, fields) {
            if (err) {
                reject(err);
            } else {
                if (rows.length > 0) {
                    resolve(rows[0]);
                } else {
                    resolve(null)
                }
            }
        });
    })
};

exports.async_account_getUser = async (account, org_id) => {
    return new Promise((resolve, reject) => {
        var sql = `SELECT a.*,b.* FROM t_users a left join user_organization b on a.userid=b.uuid WHERE a.account ="${account}" and b.org_id = ${org_id} limit 1`;
        query(sql, function (err, rows, fields) {
            if (err) {
                reject(err);
            } else {
                if (rows.length > 0) {
                    resolve(rows[0]);
                } else {
                    resolve(null)
                }
            }
        });
    })
};

exports.get_captcha = async (mobile) => {
    return new Promise((resolve, reject) => {
        let sql = `select * from captcha where mobile=${mobile} limit 1`;
        //console.log(sql);
        query(sql, function (err, rows) {
            if (err) {
                return resolve(null);
            }
            if (rows.length > 0) {
                resolve(rows[0]);
            } else {
                resolve(null);
            }
        });
    });
}

exports.get_boss_id = async (org_id) => {
    return new Promise((resolve, reject) => {
        let sql = `select boss_uuid from organization where id = ${org_id} `;
        //console.log(sql);
        query(sql, function (err, rows) {
            if (rows.length > 0) {
                resolve(rows[0].boss_uuid);
            } else {
                resolve(0);
            }
        });
    });
}

exports.get_org_score = async (org_id,uuid) => {
    return new Promise((resolve, reject) => {
        let sql = `select score from user_organization where uuid = ${uuid} and org_id = ${org_id}`;
        //console.log(sql);
        query(sql, function (err, rows) {
            if (rows.length > 0) {
                resolve(rows[0].score);
            } else {
                resolve(0);
            }
        });
    });
}

exports.get_org_superior = async (org_id,uuid) => {
    return new Promise((resolve, reject) => {
        let sql = `SELECT
	T2.*
FROM
	( SELECT
	@r AS _id,
	( SELECT @r := parent_uuid FROM user_organization WHERE uuid = _id ) AS parent_id
FROM
	( SELECT @r := ${uuid} ) _,
	user_organization h 
WHERE
	@r != 0 
	AND h.org_id = ${org_id} ) T1
	JOIN user_organization T2 ON T1._id = T2.uuid
	where T2.org_id = ${org_id} and T2.uuid != ${uuid}`;
        //console.log(sql);
        query(sql, function (err, rows) {
            if (rows.length > 0) {
                resolve(rows);
            } else {
                resolve([]);
            }
        });
    });
}

exports.authentication = (uuid, name, id_card, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `update t_users set real_name =${name},id_card=${id_card} where userid=${uuid}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(true);
    });
}

exports.bind_mobile = (uuid, mobile, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `update t_users set mobile =${mobile} where userid=${uuid}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(true);
    });
}

exports.conversion_goal = (uuid, org_id, callback) => {
    callback = callback == null ? nop : callback;
    let sql = `update user_organization set score=score+goal, goal=0 where uuid=${uuid} and org_id=${org_id}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(true);
    });
}

exports.find_coin_log = (uuid, org_id, page, callback) => {
    callback = callback == null ? nop : callback;
    let page_limit = 10;
    let page_start = page * page_limit;
    let sql = `selectg * from update_coin_log where uuid=${uuid} and org_id=${org_id} order by id desc limit ${page_start},${page_limit}`;
    //console.log(sql);
    query(sql, function (err, rows) {
        callback(rows);
    });
}

exports.query = query;