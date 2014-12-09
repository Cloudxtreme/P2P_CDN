# A WebRTC-based P2P CDN Implementation

Known Bugs
=============
FIXED: Offload to server if DataChannel is unavailable (functionality to detect already exists)
Offload to server if P2P_CDN is taking too long (longer than 2000 ms)
Look into the cross-platform issues
Race conditions
WebSocket heartbeats being stupid
Sending pictures bigger than 300 x 150, which is default canvas size
