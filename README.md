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

The support configuration depends on your device. The foscam public cgi defines the following:

bit 3 | bit 2 | bit 1 | bit 0

bit 0 = Ring
bit 1 = Send email
bit 2 = Snap picture
bit 3 = Record

The following seems to be valid for the C2 as well (not found in any documentation)

bit 7 | bit 6 | bit 5 | bit 4 | bit 3 | bit 2 | bit 1 | bit 0

bit 0 = Ring
bit 1 = Send email
bit 2 = Snap picture
bit 3 = Record
bit 7 = Push message to phone

Note: The configuration is defined as int, thus the following are valid, for example:
0 (Do Nothing), 1 (Ring), 2 (Email), 3 (Ring + Email), 4 (Record), 
12 (Picture and Record), 13 (Ring, Picture and Record), etc.

P.S.: Any ARMED state will activate motion detection by default.