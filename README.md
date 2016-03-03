# homebridge-foscam
Foscam plugin for homebridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-foscam
3. Update your configuration file. See the sample below.

# Configuration

Configuration sample:

```
"accessories": [{
	"accessory": "Foscam",
	"name": "C2 Hallway",
	"username": "my-username",
	"password": "bad-password1",
	"host": "192.168.0.50",
	"port": "88",
	"path": "local path to save snapshots"
}]
```
