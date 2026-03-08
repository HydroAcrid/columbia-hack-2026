const dg = require('@deepgram/sdk');
console.log("createClient exists?", !!dg.createClient);
console.log("LiveTranscriptionEvents exists?", !!dg.LiveTranscriptionEvents);
console.log("ListenLiveClient exists?", !!dg.ListenLiveClient);
