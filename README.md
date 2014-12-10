# A WebRTC-based P2P CDN Implementation

##System Description

In this readme, we break the code into two sections, one to
describe the front-end implementation and one to describe
the back-end.

### Server.js

*Server.js* contains the code used to define our signaling
server, which provides clients the ability to pass messages
back and forth; this server is predominately used to tell
clients when and where to open data channels. Within this
server, we continuously maintain an object literal called
rtc to keep track of rooms, clients within each room, as
well as the status of each client’s downloaded content.
Our server follows a strict algorithm every time a client
connects:

* On connection, the client-side code places the user in
an random room. If the client is placed in a room that
hasn’t yet been created, we construct a room object
within rtc and add the newly joined socket into the
room array. If this room already exists, we locate it
within rtc and push the socket in.
* Two arrays exist within each room object: one to
keep track of every client connected and another to
remember every connected client that has already
successfully downloaded the page’s assets and is thus
able to upload assets. If the latter is non-empty,
we pick a random ”initiator” from this array and
pair it with the newly joined client. If necessary,
the client code now handles the asset uploading and
downloading.If the ”initiator” array is indeed empty,
we simply download the page’s assets from the server,
because we know there are no available peers in the
given room.
* Once this newly joined client successfully downloads
the page’s assets, we add the client’s socket id into the
”initiator” array within our room object, indicating
that this client can serve page assets to new clients.

Our signaling server also handles situations in which peers
connect, download assets, and then disconnect from the
page:
* When a user disconnects from the page, we loop
through every room with our rtc object and delete
every occurence of that user’s socket id.
* We then emit a message to the client-side code, which
cleans up data channels, peer connections, and the
like.

### Main.js

*Main.js* contains the meat of our CDN functionality;
within this code, we handle room placement, server offload,
browser compatibility checks, construction of peer connections,
client disconnects, d3 visualizations, data uploading
and downloading.

Room Placement:
* When a user connects the website, we immediately
generate and place a random token (currently 1
through 5) in the user’s URL. This token represents
the network this client will be connected into. A user
only transfers assets between clients within the same
room.

Server Offload and Browser Compatibility:
* There are many reasons why we might force a client
to download assets from the server as opposed to from
another browser. First and foremost, if a user is the
first to a given room, there are no other browsers from
which to download content. To retrieve assets from
the server, we can simply write them directly into
the DOM. For instance, to download an image from
the server, we programatically inject a src attribute
into a pre-placed '<img />' tag.
* Additionally, we force users to download from the
server if their browsers are not WebRTC-compatible.
Fortunately, Google has written a polyfill called
adapter.js to determine if a browser supports WebRTC.
If it doesn’t, we immediately download content
from the server and flag the socket id so that
other browsers don’t attempt to establish data channels
with it.

Construction/Destruction of Peer Connections and Data
Channels:
* Once the signaling server matches a browser that has
already downloaded the page’s assets with a newcomer,
each user establishes a new RTCPeerConnection,
client metadata is exchanged via the signaling
server, and a data channel is built from the connection.

Data Uploading/Downloading:
* Once a data channel opens between two peers, the
sender batches data into 64 Kb chunks (the maximum
load of a WebRTC data channel) and ports these
packets through the established data channel.
* In the case of uploading and downloading an image,
we write the image data to an invisible '<canvas>'
element, convert the canvas element into an array of
8-bit unsigned integers representing an image, and
send the array in 64 Kb chunks.
* Upon receiving the image data, the receiver simply
stitches the array back into a '<canvas>' element and
displays it on the page.