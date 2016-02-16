var Service;
var Characteristic;
var Foscam = require("foscam-client");
var debug = require("debug")("FoscamAccessory");

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-foscam", "Foscam", FoscamAccessory);
}

function FoscamAccessory(log, config) {
  this.log = log;

  // url info
  this.name = config["name"];
  this.username = config["username"];
  this.password = config["password"];
  this.host = config["host"];
  this.port = config["port"] || 88;
  this.cache_timeout = 1; // seconds
  this.updating = false;
    
    if(config["sn"]){
        this.sn = config["sn"];
    } else {
        var shasum = crypto.createHash('sha1');
        shasum.update(this.username+"@"+this.host+":"+this.port);
        this.sn = shasum.digest('base64');
        debug('Computed SN ' + this.sn);
    }
    
  this.camera = new Foscam({
                            username: this.username,
                            password: this.password,
                            host: this.host,
                            port: this.port,
                            protocol: 'http', // default
                            rejectUnauthorizedCerts: true // default
                            });
}

FoscamAccessory.prototype.periodicUpdate = function() {
    if(!this.updating && this.camera) {
        this.updating = true;
        var deviceState = camera.getDevState();
        
        deviceState.then(function(state) {
                         console.log(state);
                         this.updating = false;
        });
    }
}

FoscamAccessory.prototype = {

  getServices: function() {

    // you can OPTIONALLY create an information service if you wish to override
    // the default values for things like serial number, model, etc.
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, "Foscam")
      .setCharacteristic(Characteristic.Model, "C2")
      .setCharacteristic(Characteristic.SerialNumber, this.sn);

    var service, changeAction;
    service = new Service.MotionSensor();
    changeAction = function(newState){
        service.getCharacteristic(Characteristic.MotionDetected)
                .setValue(newState);
    };
      
    setInterval(this.periodicUpdate.bind(this), this.cache_timeout * 1000);

    return [informationService, service];
  }
};
