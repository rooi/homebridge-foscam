var Service;
var Characteristic;
var Foscam = require("foscam-client");
var crypto = require("crypto");

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-foscam", "Foscam", FoscamAccessory);

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
            this.log.debug('Computed SN ' + this.sn);
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

    FoscamAccessory.prototype = {
    
        periodicUpdate: function() {
            if(!this.updating && this.camera) {
                this.updating = true;
                
                this.camera.getDevState()
                .then(function (state) {
                      if(state.motionDetectAlarm == 2) this.log("Motion detected");
                      this.deviceState = state;
                      if(this.motionService) {
                          var charA = this.motionService.getCharacteristic(Characteristic.StatusActive);
                          if(charA) charA.setValue(state.motionDetectAlarm > 0);
                      
                          var charF = this.motionService.getCharacteristic(Characteristic.StatusFault);
                          if(charF) charF.setValue(false);
                      
                          var charM = this.motionService.getCharacteristic(Characteristic.MotionDetected);
                          if(charM) charM.setValue(state.motionDetectAlarm == 2);
                      
                      }
                      this.updating = false;
                      }.bind(this))
                .catch(function (err) {
                       this.deviceState = 0;
                       var charF = this.motionService.getCharacteristic(Characteristic.StatusFault);
                       if(charF) charF.setValue(true);
                       
                       this.log(err);
                       this.updating = false;
                       }.bind(this));
            }
        },
        
        // Handles the request to get he current motion sensor state.
        getCurrentMotionSensorState: function(callback) {
            // Periodic update sets the state. Simply get it from there
            var motionDetected = false;
            if(this.deviceState) motionDetected = this.deviceState.motionDetectAlarm == 2;
            callback(null,motionDetected);
        },
        
        getStatusActive: function(callback) {
            // Periodic update sets the state. Simply get it from there
            var statusActive = false;
            if(this.deviceState) statusActive = this.deviceState.motionDetectAlarm > 0;
            callback(null,statusActive);
        },
        
        getStatusFault: function(callback) {
            // Periodic update sets the state. Simply get it from there
            var statusFault = true;
            if(this.deviceState) statusFault = this.deviceState.motionDetectAlarm > 0;
            callback(null,statusFault);
        },


        getServices: function() {

            // you can OPTIONALLY create an information service if you wish to override
            // the default values for things like serial number, model, etc.
            var informationService = new Service.AccessoryInformation();

            informationService
              .setCharacteristic(Characteristic.Name, this.name)
              .setCharacteristic(Characteristic.Manufacturer, "Foscam")
              .setCharacteristic(Characteristic.Model, "C2")
              .setCharacteristic(Characteristic.SerialNumber, this.sn);

            this.motionService = new Service.MotionSensor();
            this.motionService
                .getCharacteristic(Characteristic.MotionDetected)
                .on('get', this.getCurrentMotionSensorState.bind(this));
            
            this.motionService
                .getCharacteristic(Characteristic.StatusActive)
                .on('get', this.getStatusActive.bind(this));
            
            this.motionService
                .getCharacteristic(Characteristic.StatusFault)
                .on('get', this.getStatusFault.bind(this));
            
            setInterval(this.periodicUpdate.bind(this), this.cache_timeout * 1000);

            return [informationService, this.motionService];
      }
    }
};

