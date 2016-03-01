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
      this.updatingState = false;
        
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
            if(this.camera) {
                if(!this.updatingState) {
                    this.updatingState = true;
                    
                    this.camera.getDevState()
                    .then(function (state) {
                          this.updatingState = false;
                          if(state) {
                            if(state.motionDetectAlarm == 2) this.log("Motion detected");
                            var oldState = this.deviceState;
                            this.deviceState = state;
                            if(this.motionService && oldState) {
                              // Check for changes
                              if((oldState.motionDetectAlarm>0) != (state.motionDetectAlarm>0)) {
                                  var charA = this.motionService.getCharacteristic(Characteristic.StatusActive);
                                  if(charA) charA.setValue(state.motionDetectAlarm > 0);
                              }
                          
                              var charF = this.motionService.getCharacteristic(Characteristic.StatusFault);
                              if(charF && charF.getValue()) charF.setValue(false);
                          
                              if((oldState.motionDetectAlarm==2) != (state.motionDetectAlarm==2)) {
                                  var charM = this.motionService.getCharacteristic(Characteristic.MotionDetected);
                                  if(charM) charM.setValue(state.motionDetectAlarm == 2);
                              }
                            }
                        }
                        else this.log("getDevState return empty result, trying again...")
                    }.bind(this))
                    .catch(function (err) {
                           this.updatingState = false;
                           this.deviceState = 0;
                           var charF = this.motionService.getCharacteristic(Characteristic.StatusFault);
                           if(charF) charF.setValue(true);
                           
                           this.log(err);
                    }.bind(this));
                }
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
            this.camera.getMotionDetectConfig1()
            .then(function (config) {
                  this.log("config.isEnable = " + config.isEnable);
                  var charA = this.motionService.getCharacteristic(Characteristic.StatusActive);
                  if(charA) charA.setValue(config.isEnable>0);
                  callback(null,config.isEnable>0);
                  
            }.bind(this))
            .catch(function (err) {
                   this.log(err);
                   var charF = this.motionService.getCharacteristic(Characteristic.StatusFault);
                   if(charF) charF.setValue(true);
                   callback(null,false);
            }.bind(this));
            
        },
        
        setStatusActive: function(value,callback) {
            var enable = value ? 1 : 0;
            
            // get the old config before changing
            this.camera.getMotionDetectConfig1()
            .then(function (config) {
                  config.isEnable = enable;
                  this.camera.setMotionDetectConfig1(config)
                  if(callback) callback(null);
                  
            }.bind(this))
            .catch(function (err) {
                this.log(err);
                if(callback) callback(err);
            }.bind(this));
        },
        
        getStatusFault: function(callback) {
            // Periodic update sets the state. Simply get it from there
            var statusFault = true;
            if(this.deviceState) statusFault = 0;// Always 0 for now this.deviceState.motionDetectAlarm > 0;
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
            
            this.motionService
                .addCharacteristic(Characteristic.On)
                .on('get', this.getStatusActive.bind(this))
                .on('set', this.setStatusActive.bind(this));
            
            setInterval(this.periodicUpdate.bind(this), this.cache_timeout * 1000);

            return [informationService, this.motionService];
      }
    }
};

