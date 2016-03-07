var Service;
var Characteristic;
var Foscam = require("foscam-client");
var crypto = require("crypto");
var fs = require("fs");
var mkdirp = require("mkdirp");

module.exports = function(homebridge){
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-foscam", "Foscam", FoscamAccessory);

    function FoscamAccessory(log, config){
        this.log = log;

        // Import from config.json
        this.name = config["name"];
        this.username = config["username"];
        this.password = config["password"];
        this.host = config["host"];
        this.port = config["port"] || 88;
        this.stay = parseInt(config["stay"]) & 3 || 0;
        this.away = parseInt(config["away"]) & 3 || 0;
        this.night = parseInt(config["night"]) & 3|| 0;
        this.path = config["path"];
        this.cache_timeout = 1; // seconds
        this.updatingState = false;

        // Generate serial number if not defined in config.json
        if(config["sn"]){
            this.sn = config["sn"];
        } else {
            var shasum = crypto.createHash('sha1');
            shasum.update(this.username+"@"+this.host+":"+this.port);
            this.sn = shasum.digest('base64');
            this.log.debug('Computed SN ' + this.sn);
        }

        // Setup for foscam-client
        this.camera = new Foscam({
            username: this.username,
            password: this.password,
            host: this.host,
            port: this.port,
            protocol: 'http', // default
            rejectUnauthorizedCerts: true // default
        });

        // API detection
        this.camera.getMotionDetectConfig().then(function(config){
            if(config.result == 0){
                this.getConfig = this.camera.getMotionDetectConfig();
                this.setConfig = function(config){this.camera.setMotionDetectConfig(config);}
            } else {
                this.getConfig = this.camera.getMotionDetectConfig1();
                this.setConfig = function(config){this.camera.setMotionDetectConfig1(config);}
            }
        }.bind(this))
        .catch(function(err){
                this.log(err);
        }.bind(this));

        // Definition Mapping
        // HomeKit TargetState: 0 (STAY_ARM), 1 (AWAY_ARM), 2 (NIGHT_ARM), 3 (DISARMED), 4 (ALARM_TRIGGERED)
        this.convertion = [this.stay, this.away, this.night];
        this.armState = ["Armed (Stay).", "Armed (Away).", "Armed (Night).", "Disarmed.", "Alarm Triggered."]
    }

    FoscamAccessory.prototype = {
    
        periodicUpdate: function(){
            if(this.camera && !this.updatingState){
                this.updatingState = true;
                this.camera.getDevState().then(function(state){
                    this.getConfig.then(function(config){
                    this.updatingState = false;
                        if(state && config){

                            // Saving previous state to check for changes
                            var oldCurrentState = this.currentState;
                            var oldTargetState = this.targetState;
                            this.result = state.result;

                            // Compute CurrentState and TargetState
                            if(config.isEnable == 0){
                                this.currentState = 3;
                                this.targetState = 3;
                            } else if(config.isEnable == 1){
                                if(this.convertion.indexOf(config.linkage & 3) >= 0){
                                    this.currentState = this.convertion.indexOf(config.linkage & 3);
                                    this.targetState = this.convertion.indexOf(config.linkage & 3);
                                } else {
                                    this.currentState = 3;
                                    this.targetState = 3;
                                }
                            }

                            // Detect for alarm triggered
                            if(state.motionDetectAlarm == 2){
                                this.log("Motion detected!");
                                this.currentState = 4;
                            }

                            if(this.securityService && oldCurrentState >= 0 && oldTargetState >= 0){

                                // Status fault is always 0 for successful call
                                this.securityService.setCharacteristic(Characteristic.StatusFault, false);

                                // Check for changes
                                if(oldCurrentState != this.currentState || oldTargetState != this.targetState){

                                    // Refresh CurrentState and TargetState
                                    this.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, this.currentState);
                                    this.securityService.getCharacteristic(Characteristic.SecuritySystemTargetState).getValue();
                                }
                            }
                        } else this.log("getDevState return empty result, trying again...");
                    }.bind(this));
                }.bind(this))
                .catch(function(err){
                    this.updatingState = false;
                    this.currentState = -1;
                    this.targetState = -1;
                    this.result = -1;

                    // Set status fault to 1 in case of error
                    this.securityService.setCharacteristic(Characteristic.StatusFault, true);
                    this.log(err);
                }.bind(this));
            }
        },
        
        // Handles the request to get the current state
        getCurrentState: function(callback){

            // Periodic update sets the state. Simply get it from there
            if(this.currentState >= 0){			
                this.log("Current state: " + this.armState[this.currentState]);
                callback(null, this.currentState);
            } else {
                callback(null, 3);
            }
        },

        // Handles the request to get the target state
        getTargetState: function(callback){

            // Periodic update sets the state. Simply get it from there
            if(this.targetState >= 0)	callback(null, this.targetState);
            else						callback(null, 3);
        },

        // Handles the request to set the target state
        setTargetState: function(value, callback){

            // Convert TargetState to isEnable
            var enable = value < 3 ? 1 : 0;

            // Get current config
            this.getConfig.then(function(newConfig){

                // Change isEnable to requested state
                newConfig.isEnable = enable;
                if(enable){
                    currentLinkage = newConfig.linkage;
                    newConfig.linkage = (this.convertion[value] & 3) | (currentLinkage & 12);
                }

                // Update config with requested state
                this.setConfig(newConfig);
                this.log(this.armState[value]);
                callback(null);
            }.bind(this))
            .catch(function (err){

                // Set status fault to 1 in case of error
                this.securityService.setCharacteristic(Characteristic.StatusFault, true);
                this.log(err);
                callback(err);
            }.bind(this));
        },

        // Handles the request to get the status fault
        getStatusFault: function(callback){

            // Periodic update sets the state. Simply get it from there
            // result is 0 for successful call
            statusFault = this.result == 0 ? false : true;
            callback(null, statusFault);
        },

        // Handles the request to take snapshot
        snapPicture: function(snapshot, callback){
            if(snapshot){
                this.camera.snapPicture2().then(function(jpeg){

                    // Create directory for snapshots
                    mkdirp(this.path, function(err){
                        if(err){
                            this.log(err);
                            this.log("Snapshot directory cannot be created.");
                        } else {

                            // Write data as jpeg file to predefined directory
                            var timeStamp = new Date();
                            fs.writeFile(this.path + "/snap_" + timeStamp.valueOf() + ".jpeg", jpeg, function(err){
                                if(err){
                                    this.log(err);
                                    this.log("Snapshot cannot be saved.");
                                } else {
                                    this.log("Took a snapshot.");
                                }
                            }.bind(this));
                        }
                    }.bind(this));

                    // Set switch back to off after 1s
                    setTimeout(function(){
                        this.snapService.setCharacteristic(Characteristic.On, false);
                    }.bind(this), 1000);

                    callback(null);
                }.bind(this))
                .catch(function(err){
                    this.log(err);
                    callback(err);
                }.bind(this));
            } else {
                callback(null);
            }
        },

        // Handles the identify request
        identify: function(callback){
            this.log("Identify requested!");
            callback();
        },

        getServices: function(){

            // you can OPTIONALLY create an information service if you wish to override
            // the default values for things like serial number, model, etc.
            var informationService = new Service.AccessoryInformation();
            informationService
                .setCharacteristic(Characteristic.Manufacturer, "Foscam Digital Technology LLC")
                .setCharacteristic(Characteristic.Model, "C2")
                .setCharacteristic(Characteristic.SerialNumber, this.sn);

            // Service for the motion detection
            this.securityService = new Service.SecuritySystem("Motion Detection");
            this.securityService.getCharacteristic(Characteristic.StatusFault)
                .on('get', this.getStatusFault.bind(this));

            this.securityService.getCharacteristic(Characteristic.SecuritySystemCurrentState)
                .on('get', this.getCurrentState.bind(this));

            this.securityService.getCharacteristic(Characteristic.SecuritySystemTargetState)
                .on('get', this.getTargetState.bind(this))
                .on('set', this.setTargetState.bind(this));

            // Service for taking snapshots
            this.snapService = new Service.Switch("Snapshot");
            this.snapService.getCharacteristic(Characteristic.On)
                .on('set', this.snapPicture.bind(this));

            setInterval(this.periodicUpdate.bind(this), this.cache_timeout * 1000);

            return [informationService, this.securityService, this.snapService];
        }
    }
};

