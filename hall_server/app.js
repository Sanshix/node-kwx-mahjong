
var client_service = require("./client_service");
var room_service = require("./room_service");


console.log(process.argv[2],"123");

var configs = require("../configs_local");
var config = configs.hall_server();

console.log(" ",configs,config)
var db = require('../utils/db');
db.init(configs.mysql());

client_service.start(config);
room_service.start(config);