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
        // Foscam motionDetectAlarm: 0 (Disabled), 1 (No Alarm), 2 (Detect Alarm)
        // Foscam isEnable: 0 (Disabled), 1 (Enabled)
        // HomeKit CurrentState: 0 (STAY_ARM), 1 (AWAY_ARM), 2 (NIGHT_ARM), 3 (DISARMED), 4 (ALARM_TRIGGERED)
        // HomeKit TargetState: 0 (STAY_ARM), 1 (AWAY_ARM), 2 (NIGHT_ARM), 3 (DISARMED)
        this.homekitConvertion = [3, 1, 4];		// Convert Foscam motionDetectAlarm/isEnable to HomeKit CurrentState/TargetState
        this.foscamConvertion = [1, 1, 1, 0];	// Convert HomeKit TargetState to Foscam isEnable
    }

    FoscamAccessory.prototype = {
    
        periodicUpdate: function(){
            if(this.camera && !this.updatingState){
                this.updatingState = true;
                this.camera.getDevState().then(function(state){
                    this.updatingState = false;
                    if(state){
                        if(state.motionDetectAlarm == 2) this.log("Motion detected");

                        // Saving previous state to check for changes
                        var oldState = this.deviceState;
                        this.deviceState = state;

                        if(this.securityService && oldState){

                            // Status fault is always 0 for successful call
                            this.securityService.setCharacteristic(Characteristic.StatusFault, false);

                            // Check for changes
                            if(oldState.motionDetectAlarm != state.motionDetectAlarm){

                                // Convert motionDetectAlarm to CurrentState
                                var currentState = this.homekitConvertion[state.motionDetectAlarm];
                                this.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, currentState);
                            }
                        }
                    } else this.log(this.name + " getDevState return empty result, trying again...")
                }.bind(this))
                .catch(function(err){
                    this.updatingState = false;
                    this.deviceState = 0;

                    // Set status fault to 1 in case of error
                    this.securityService.setCharacteristic(Characteristic.StatusFault, true);
                    this.log(err);
                }.bind(this));
            }
        },
        
        // Handles the request to get the current state.
        getCurrentState: function(callback){
            // Periodic update sets the state. Simply get it from there

            // Default current state to DISARMED (Failsafe)
            var currentState = 3;

            if(this.deviceState){

                // Convert motionDetectAlarm to CurrentState
                currentState = this.homekitConvertion[this.deviceState.motionDetectAlarm];
                this.log(this.name + " motion detection is " + (currentState < 3 ? "enabled." : "disabled."));
                if(currentState == 4) this.log(this.name + " motion detected!");
            }
            callback(null, currentState);
        },

        // Handles the request to get the target state
        getTargetState: function(callback){
            this.getConfig.then(function(config){

                // Convert isEnable to TargetState
                var targetState = this.homekitConvertion[config.isEnable];
                callback(null, targetState);
            }.bind(this))
            .catch(function(err){

                // Set status fault to 1 in case of error
                this.securityService.setCharacteristic(Characteristic.StatusFault, true);
                this.log(err);

                // Return TargetState as DISARMED in case of error
                callback(null, 3);
            }.bind(this));
        },

        // Handles the request to set the target state
        setTargetState: function(value,callback){

            // Convert TargetState to isEnable
            var enable = this.foscamConvertion[value];

            // Get current config
            this.getConfig.then(function(config){

                // Change isEnable to requested state
                config.isEnable = enable;

                // Update config with requested state
                this.setConfig(config);
                this.log(this.name + " motion detection is " + (enable ? "enabled." : "disabled."));
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

            // Default status fault to 1 (Failsafe)
            var statusFault = true;

            // result is 0 for successful call
            if(this.deviceState) statusFault = this.deviceState.result == 0 ? false : true;
            callback(null, statusFault);
        },

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
                                    this.log(this.name + " took a snapshot.");
                                }
                            }.bind(this));
                        }
                    }.bind(this));

                    // Set switch back to off after 1s
                    setTimeout(function(){
                        this.snapService.setCharacteristic(Characteristic.On, false);
                    }.bind(this), 1000);

                    if(callback) callback(null);
                }.bind(this))
                .catch(function(err){
                    this.log(err);
                    if(callback) callback(err);
                }.bind(this));
            } else {
                if(callback) callback(null);
            }
        },

        // Handles the identify request
        identify: function(callback){
            this.log(this.name + " identify requested!");
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

            return [informationService, this.motionService, this.snapService];
        }
    }
};

