exports = module.exports;

exports.new = function(id, io, fTable) {
	return new Router(id, io, fTable);
}

function Router(id, io, fTable) {
	var self = this;

	this.connect = function(dest) {
		// something with intentId?

		var client = new Peer ({initiator: true, trickle: false});
		peer.on('signal', function (signal) {
			log('sendOffer');
			io.emit('s-send-offer', {
				intentId: intentId,
				srcId: id,
				destId: destId,
				signal: signal
			});
		});
		var listener = io.on('c-offer-accepted', offerAccepted);
		function offerAccepted(offer) {
			log('offerAccepted');
			if(offer.intentId !== intentId) {
				log('not right intentId ', offer.intentId, intentId);
				return;
			}
			// listener.destroy();
			peer.signal(offer.signal);
			peer.on('ready', function() {
				log('channel ready to send');
				peer.on('message', router);
				fingerTable.add(offer.destId, peer, self);
			});
		}
	};
	/// accept offers from peers that want to connect

	io.on('c-accept-offer', function(offer) {
    	log('acceptOffer');    
    	var peer = new Peer({trickle: false});
    
	    peer.on('ready', function() { 
			log('channel ready to listen');
			peer.on('message', router);
	    });
	    peer.on('signal', function (signal){
			log('sending back my signal data');
			offer.destId = id; // so the other peer knows what's my id
			offer.signal = signal;
			io.emit('s-offer-accepted', offer);
	    });

	    peer.signal(offer.signal);
	  });

	/// connect to the new sucessor available

	io.on('c-new-sucessor-available', function(idSucessor) {
	    log('new sucessor available - id: ', idSucessor);
	    self.connect(idSucessor);
	});
}