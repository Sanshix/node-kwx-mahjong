var crypto = require('crypto')
var http = require('http')
var querystring = require('querystring')

var md5 = crypto.createHash('md5')

var smsapi = "api.smsbao.com"
// 短信平台账号
var user = "tianrong"
// 短信平台密码
var password = "tianrong"
// 要发送的短信内容
var content = `【聚友联盟】您的登录验证码${random_code()}，验证码在60秒时间内有效`;
// 要发送短信的手机号码
var phone = "13398127330"

send_sms(smsapi, user, password, content, phone)

function send_sms(smsapi, user, password, content, phone) {
    var pass = md5.update(password).digest('hex')
    var data = {
        'u': user,
        'p': pass,
        'm': phone,
        'c': content
    }
    var content = querystring.stringify(data);
    var sendmsg = '';                                //创建空字符串，用来存放收到的数据
    var options = {
        hostname: smsapi,
        path: '/sms?' + content,
        method: 'GET'
    }
    //创建请求
    var req = http.request(options, function (res) {
        res.setEncoding('utf-8');
        res.on('data', function (result) {
            statusStr(result)
        });
        res.on('end', function () {
        });
    });
    req.on('error', function (err) {
        console.error(err);
    });
    req.end();
}

function statusStr(result) {
    switch (result) {
        case '0':
            console.log('短信发送成功')
            return true;
            break
        case '-1':
            console.log('参数不全')
            return false;
            break
        case '-2':
            console.log('服务器空间不支持,请确认支持curl或者fsocket，联系您的空间商解决或者更换空间！')
            return false;
            break
        case '30':
            console.log('密码错误')
            return false;
            break
        case '40':
            console.log('账户不存在')
            return false;
            break
        case '41':
            console.log('余额不足')
            return false;
            break
        case '42':
            console.log('账户已过期')
            return false;
            break
        case '43':
            console.log('IP地址限制')
            return false;
            break
        case '50':
            console.log('内容含有敏感字')
            return false;
            break
    }
}

function random_code() {
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}