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
	"stay": "1",
	"away": "3",
	"night": "2",
	"path": "local path to save snapshots"
}]
```

`stay`, `away`, `night` define configuration for different ARMED state.

Support configuration: 0 (Do Nothing), 1 (Ring), 2 (Email), 3 (Ring + Email)

P.S.: Any ARMED state will activate motion detection by default.

