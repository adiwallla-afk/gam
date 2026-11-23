# Build one GLB per painting: a stretched canvas, front = the painting, sides/back = canvas colours.
# Front faces +Z and the back sits at z=0, which is what wall placement in AR expects.
import json, struct, io, sys, os
from PIL import Image
site = sys.argv[1]
crops = json.load(open(os.path.join(site, 'images/crops.json')))
def pad4(b, fill=b'\0'): return b + fill * ((4 - len(b) % 4) % 4)
def box(W, H, D):
    x, y = W / 2, H / 2
    # front quad (own primitive, textured)
    front = dict(pos=[(-x,-y,D),(x,-y,D),(x,y,D),(-x,y,D)], nrm=[(0,0,1)]*4, uv=[(0,1),(1,1),(1,0),(0,0)], idx=[0,1,2,0,2,3])
    faces = [  # back, left, right, top, bottom
        ([(x,-y,0),(-x,-y,0),(-x,y,0),(x,y,0)], (0,0,-1)),
        ([(-x,-y,0),(-x,-y,D),(-x,y,D),(-x,y,0)], (-1,0,0)),
        ([(x,-y,D),(x,-y,0),(x,y,0),(x,y,D)], (1,0,0)),
        ([(-x,y,D),(x,y,D),(x,y,0),(-x,y,0)], (0,1,0)),
        ([(-x,-y,0),(x,-y,0),(x,-y,D),(-x,-y,D)], (0,-1,0)),
    ]
    rest = dict(pos=[], nrm=[], uv=[], idx=[])
    for quad, n in faces:
        b = len(rest['pos']); rest['pos'] += quad; rest['nrm'] += [n]*4; rest['uv'] += [(0,0),(1,0),(1,1),(0,1)]
        rest['idx'] += [b, b+1, b+2, b, b+2, b+3]
    return front, rest
def build(n, W, H, jpg, side_rgb):
    D = 0.03
    front, rest = box(W, H, D)
    bin_ = b''; views = []; accs = []
    def view(data, target=None):
        nonlocal bin_
        off = len(bin_); bin_ = pad4(bin_ + data); v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        views.append(v); return len(views) - 1
    def acc(vals, comp, typ, kind, target):
        flat = [c for v in vals for c in (v if isinstance(v, tuple) else (v,))]
        fmt = {'f': 'f', 'H': 'H'}[kind]
        data = struct.pack('<%d%s' % (len(flat), fmt), *flat)
        a = {'bufferView': view(data, target), 'componentType': comp, 'count': len(vals), 'type': typ}
        if typ == 'VEC3' and kind == 'f':
            a['min'] = [min(v[i] for v in vals) for i in range(3)]; a['max'] = [max(v[i] for v in vals) for i in range(3)]
        accs.append(a); return len(accs) - 1
    prims = []
    for part, mat in ((front, 0), (rest, 1)):
        prims.append({'attributes': {'POSITION': acc(part['pos'], 5126, 'VEC3', 'f', 34962), 'NORMAL': acc(part['nrm'], 5126, 'VEC3', 'f', 34962),
                                     'TEXCOORD_0': acc(part['uv'], 5126, 'VEC2', 'f', 34962)},
                      'indices': acc(part['idx'], 5123, 'SCALAR', 'H', 34963), 'material': mat})
    img_view = view(jpg)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tal-levi-site'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'canvas-%02d' % n}],
        'meshes': [{'primitives': prims}],
        'materials': [
            {'name': 'painting', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': .85}},
            {'name': 'canvas-edge', 'pbrMetallicRoughness': {'baseColorFactor': [c / 255 for c in side_rgb] + [1], 'metallicFactor': 0, 'roughnessFactor': .95}}],
        'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'images': [{'bufferView': img_view, 'mimeType': 'image/jpeg'}],
        'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
    }
    js = pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    return out
for n in range(1, 39):
    c = crops[str(n)]; r = c['ratio']
    W = 0.9 if r >= 1 else 0.9 * r; H = W / r          # default: longest side 90 cm; the page rescales to the chosen / real size
    im = Image.open(os.path.join(site, 'images/crop/w%02d.jpg' % n)).convert('RGB'); im.thumbnail((1024, 1024))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=82); edge = tuple(int(h[i:i+2], 16) for h in [c['colors'][0]] for i in (1, 3, 5))
    open(os.path.join(site, 'models/w%02d.glb' % n), 'wb').write(build(n, W, H, b.getvalue(), edge))
print('ok')
