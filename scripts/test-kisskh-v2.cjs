const assert = require('node:assert');
class FakeResponse {
  constructor(body, status=200){ this.body=body; this.status=status; this.ok=status>=200&&status<300; }
  json(){ return Promise.resolve(this.body); }
  text(){ return Promise.resolve(typeof this.body==='string'?this.body:JSON.stringify(this.body)); }
}
let videoRequest='';
let subtitleRequest='';
global.fetch = function(url, options={}) {
  if (url.startsWith('https://www.themoviedb.org/tv/1396')) {
    return Promise.resolve(new FakeResponse('<meta property="og:title" content="Breaking Bad (2008) - The Movie Database (TMDB)">'));
  }
  if (url.startsWith('https://kisskh.id/api/DramaList/Search')) {
    return Promise.resolve(new FakeResponse([{id:10,title:'Breaking Bad'},{id:11,title:'Breaking Bad Special'}]));
  }
  if (url.startsWith('https://kisskh.id/api/DramaList/Drama/10')) {
    return Promise.resolve(new FakeResponse({id:10,title:'Breaking Bad',type:'TV Series',releaseDate:'2008-01-20',episodes:[{id:1001,number:1},{id:1002,number:2}]}));
  }
  if (url.startsWith('https://kisskh.id/api/DramaList/Drama/11')) {
    return Promise.resolve(new FakeResponse({id:11,title:'Breaking Bad Special',type:'Movie',releaseDate:'2011-01-01',episodes:[{id:1101,number:1}]}));
  }
  if (url.includes('script.google.com/macros/s/') && url.includes('1002')) {
    if (url.includes('AKfycbyq6hTj0ZhlinYC6xbggtgo166tp6XaDKBCGtnYk8uOfYBUFwwxBui0sGXiu_zIFmA')) {
      return Promise.resolve(new FakeResponse({key:'subtitle key'}));
    }
    return Promise.resolve(new FakeResponse({key:'video key'}));
  }
  if (url.startsWith('https://kisskh.id/api/DramaList/Episode/1002.png')) {
    videoRequest=url;
    return Promise.resolve(new FakeResponse({Video:'https://cdn.example/episode-1080.m3u8',ThirdParty:'https://embed.example/not-direct'}));
  }
  if (url.startsWith('https://kisskh.id/api/Sub/1002')) {
    subtitleRequest=url;
    return Promise.resolve(new FakeResponse([
      {label:'English',src:'https://cdn.example/en.vtt'},
      {label:'Bahasa Melayu',src:'https://cdn.example/ms.vtt'},
      {label:'Indonesian',src:'https://cdn.example/id.vtt'},
      {label:'English',src:'https://cdn.example/encrypted.txt'}
    ]));
  }
  return Promise.resolve(new FakeResponse({},404));
};
const provider = require('../generated/kisskh/provider.generated.js');
provider.getStreams('1396','tv',1,2).then(streams=>{
  assert.equal(streams.length,1);
  assert.equal(streams[0].url,'https://cdn.example/episode-1080.m3u8');
  assert.equal(streams[0].quality,'1080p');
  assert.equal(streams[0].type,'m3u8');
  assert.ok(videoRequest.includes('kkey=video%20key'));
  assert.ok(subtitleRequest.includes('kkey=subtitle%20key'));
  assert.deepEqual(streams[0].subtitles.map(x=>x.language).sort(),['English','Indonesian','Malay']);
  console.log('KissKH converter v2 mock test passed.');
}).catch(e=>{ console.error(e); process.exit(1); });
