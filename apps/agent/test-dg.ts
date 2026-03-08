import * as dg from "@deepgram/sdk";
const client = new (dg as any).DeepgramClient("dummy");
console.log("client.listen keys:", Object.keys(client.listen));
console.log("client.listen.liveClient type:", typeof (client.listen as any).liveClient);
console.log("dg.listen type:", typeof (dg as any).listen);
console.log("dg.listen keys:", Object.keys((dg as any).listen || {}));
