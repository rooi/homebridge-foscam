# homebridge-foscam
libcec plugin for homebridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install foscam-client https://github.com/lightswitch05/foscam-client.git
3. Install this plugin using: npm install -g homebridge-foscam
4. Update your configuration file. See the sample below.

# Configuration

Configuration sample:

```
"accessories": [
{
"accessory": "Foscam",
"name": "C2 Hallway",
"username": "my-username",
"password": "bad-password1",
"host": "192.168.0.50",
"port": "88",
"window_seconds": "5"
}
]
```
