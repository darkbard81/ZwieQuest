import assert from 'node:assert/strict';
export function losslessWebpInfo(data) {
  assert.equal(data.toString('ascii',0,4),'RIFF');
  assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.equal(data.readUInt32LE(4)+8,data.length,'RIFF length');
  for(let offset=12;offset+8<=data.length;){
    const type=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4),start=offset+8;
    assert.ok(start+size<=data.length,'complete chunk');
    assert.notEqual(type,'VP8 ','lossy color bitstream is forbidden');
    if(type==='VP8L'){
      assert.ok(size>=5);assert.equal(data[start],0x2f);
      const bits=data.readUInt32LE(start+1);assert.equal(bits>>>29,0,'VP8L version');
      return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1,alpha:!!((bits>>>28)&1)};
    }
    offset=start+size+(size&1);
  }
  assert.fail('missing lossless VP8L bitstream');
}
