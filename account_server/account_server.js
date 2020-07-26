
var crypto = require('../utils/crypto');
var express = require('express');
var db = require('../utils/db');
var http = require('../utils/http');
var captcha = require('../utils/captcha')
var app = express();
var domain = require('domain');
var hallAddr = '';

function send(res, ret) {
	var str = JSON.stringify(ret);
	res.send(str)
}

var config = null;


exports.start = function(cfg) {
	config = cfg;
	hallAddr = config.HALL_IP + ':' + config.HALL_CLIENT_PORT;
	app.listen(config.CLIENT_PORT);
	console.log("account server is listening on " + config.CLIENT_PORT);
}

app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
    res.header("X-Powered-By", ' 3.2.1')
    res.header("Content-Type", "application/json;charset=utf-8");
    next();
});

app.use(function (err, req, res, next) {
    //res.status(err.status || 500);
    console.error(err, err.message);
    http.send(res, 1, 'server error', {})
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
app.get('/register',function(req, res) {
	var account = req.query.account;
	var password = req.query.password;

	var fnFailed = function(err) {
		send(res, { errcode: 1, errmsg: err });
	};

	var fnSucceed = function() {
		send(res, { errcode: 0, errmsg: "ok" });
	};

	if (null == account || null == password)
		return;

	// TODO: check account/password validation

	db.is_user_exist(account, function(exist) {
		if (!exist) {
			db.create_account(account, password, function(ret) {
				if (ret) {
					fnSucceed();
				} else {
					fnFailed('create account failed ' + ret);
				}
			});
		} else {
			fnFailed('account has been used.');
			console.log("account has been used.");
		}
	});
});

app.get('/get_version', function(req, res) {
	var ret = {
		version: config.VERSION,
	}

	send(res, ret);
});

app.get('/get_serverinfo', function(req, res) {
	var ret = {
		version: config.VERSION,
		hall: hallAddr,
		appweb: config.APP_WEB,
	}

	send(res, ret);
});

app.get('/guest', function(req, res) {
	var account = "guest_" + req.query.account;
	var sign = crypto.md5(account + req.ip + config.ACCOUNT_PRI_KEY);
	var ret = {
		errcode: 0,
		errmsg: "ok",
		account: account,
		halladdr: hallAddr,
		sign: sign
	}

	send(res, ret);
});

app.get('/auth', function(req, res) {
	var account  = req.query.account;
	let passwords = req.query.password;
	var code = req.query.code;
    var type = req.query.type || 1; // 1账号，2手机验证，
	db.get_account_info(account, passwords,type, async function(info) {
		if (!info){
			return send(res, { errcode: 2, errmsg: "未检测到账号，请先微信登录并绑定手机号" });
		}
        if (type == 2){
			let capthca_data = await db.get_captcha(account);
			if (capthca_data == null || code != capthca_data.code){
				send(res, { errcode: 1, errmsg: "invalid code" });
				return;
			}
			db.delete_captcha(account);
        }
		var account = "vivi_" + req.query.account;
		var sign = crypto.md5(account + req.ip + config.ACCOUNT_PRI_KEY);
		var ret = {
			errcode: 0,
			errmsg: "ok",
			account: account,
			sign: sign
		}

		send(res, ret);
	});
});

// 获取验证码
app.get('/get_captcha', function (req, res) {
	var mobile = req.query.mobile; //手机号
	if (!mobile || mobile == ''){
		return send(res, { errcode: 1, errmsg: '手机号格式异常' });
	
	}
    let code = captcha.send_sms(mobile);
    db.add_captcha(mobile, code, (data) => {
        send(res, {
            errcode: 0,
            errmsg: "ok",
        })
    })
});

var appInfo = {
	Android: {
		appid: "wx9e441ca3da64f3e7",
		secret: "2bc59f74dca944715cd502bd5d0e06ca",
	},
	iOS: {
		appid: "wxcb508816c5c4e2a4",
		secret: "7de38489ede63089269e3410d5905038",
	}
};

function get_access_token(code, os, callback) {
	var info = appInfo[os];
	if (null == info) {
		callback(false, null);
	}

	var data = {
		appid: info.appid,
		secret: info.secret,
		code: code,
		grant_type: "authorization_code"
	};

	http.get2("https://api.weixin.qq.com/sns/oauth2/access_token", data, callback, true);
}

function get_state_info(access_token, openid, callback) {
	var data = {
		access_token: access_token,
		openid: openid
	};

	http.get2("https://api.weixin.qq.com/sns/userinfo", data, callback, true);
}

function create_user(account, name, sex, headimgurl, callback) {
	var coins = config.DEFAULT_USER_COINS;
	var gems = config.DEFAULT_USER_GEMS;

	db.is_user_exist(account, function(ret) {
		if (!ret) {
			db.create_user(account, name, coins, gems, sex, headimgurl, function(ret) {
				callback();
			});
		} else {
			db.update_user_info(account, name, headimgurl, sex, function(ret) {
				callback();
			});
		}
	});
};

app.get('/wechat_auth', function(req, res) {
	var code = req.query.code;
	var os = req.query.os;
	if (code == null || code == "" || os == null || os == "") {
		return;
	}

	get_access_token(code, os, function(suc, data) {
		if (suc) {
			var access_token = data.access_token;
			var openid = data.openid;
			if (!access_token || !openid){
				console.log(access_token, openid)
				return send(res, { errcode: -1, errmsg: "param err." });
			}
			get_state_info(access_token, openid, function(suc2, data2) {
				if (suc2) {
					console.log(data2);
					var openid = data2.openid;
					var nickname = data2.nickname;
					var sex = data2.sex;
					var headimgurl = data2.headimgurl;
					if (!openid){
						return send(res, { errcode: -1, errmsg: "param err." });
					}
					var account = "wx_" + openid;
					create_user(account, nickname, sex, headimgurl, function() {
						var sign = crypto.md5(account + req.ip + config.ACCOUNT_PRI_KEY);
						var ret = {
							errcode: 0,
							errmsg: "ok",
							account: account,
							halladdr: hallAddr,
							sign: sign
						};

						send(res, ret);
					});
				}
			});
		} else {
			send(res, { errcode: -1, errmsg: "unknown err." });
		}
	});
});

app.get('/base_info', function(req, res) {
	var userid = req.query.userid;
	db.get_user_base_info(userid, function(data) {
		if (!data) {
			return send(res, { errcode: -1, errmsg: "unknown err." });
		}
		var ret = {
			errcode: 0,
			errmsg: "ok",
			name: data.name,
			sex: data.sex,
			headimgurl: data.headimg
		};

		send(res, ret);
	});
});

