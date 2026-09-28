#!/usr/bin/env python3
"""
Construit public/models/hero.glb : le héros de « Gueule de bois ».

Base : MakeHuman (maillage, cibles, squelette par défaut, poids, peau, yeux, sourcils, cils,
chaussures — actifs système CC0 depuis MakeHuman 1.1, voir https://www.makehuman.org/license.php).

Étapes :
  1. morphing du maillage neutre en homme adulte (~1,80 m, léger ventre de bière) ;
  2. squelette recalculé sur le corps morphé, os sans rotation de repos (axes monde) pour
     une animation procédurale simple dans le jeu ;
  3. ajustement des « proxies » MakeHuman (yeux, sourcils, cils, chaussures dépareillées) ;
  4. vêtements générés à partir du corps : sweat à capuche, capuche relevée, caleçon,
     chaussette haute (basket) et chaussette de ville ;
  5. export glTF binaire (SkinnedMesh unique, textures intégrées) + ancres (lunettes, tutu).

Usage : sh scripts/character/fetch_assets.sh && python3 scripts/character/build_hero.py
"""
import json
import math
import os
import struct
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.path.join(ROOT, '.cache', 'makehuman')
DATA = os.path.join(CACHE, 'data')
OUT = os.path.join(ROOT, 'public', 'models', 'hero.glb')

# Homme adulte, un peu grand, un peu mou : il a eu une soirée.
TARGETS = {
    'macrodetails/caucasian-male-young': 1.0,
    'macrodetails/universal-male-young-averagemuscle-maxweight': 0.3,
    'macrodetails/height/male-young-averagemuscle-averageweight-maxheight': 0.08,
    'macrodetails/proportions/male-young-averagemuscle-averageweight-idealproportions': 0.6,
    'stomach/stomach-pregnant-incr': 0.18,
    'neck/neck-scale-horiz-incr': 0.2,
}

DM = 0.1  # MakeHuman travaille en décimètres


# ---------------------------------------------------------------------------- lecture

def load_json(rel):
    with open(os.path.join(DATA, rel)) as f:
        return json.load(f)


def parse_faces(d):
    """Faces du format JSON three.js historique : (sommets, matériau, uvs)."""
    f = d['faces']
    layers = len(d['uvs']) if d['uvs'] and len(d['uvs'][0]) else 0
    out = []
    i = 0
    while i < len(f):
        t = f[i]
        i += 1
        n = 4 if t & 1 else 3
        verts = f[i:i + n]
        i += n
        mat = 0
        if t & 2:
            mat = f[i]
            i += 1
        if t & 4:
            i += layers
        uvs = None
        if t & 8:
            uvs = f[i:i + n]
            i += n * layers
        if t & 16:
            i += 1
        if t & 32:
            i += n
        if t & 64:
            i += 1
        if t & 128:
            i += n
        out.append((verts, mat, uvs))
    return out


def triangles(faces, keep=lambda f: True):
    tris = []
    for verts, mat, uvs in faces:
        if not keep((verts, mat, uvs)):
            continue
        idx = [(verts[k], uvs[k] if uvs else -1) for k in range(len(verts))]
        tris.append((idx[0], idx[1], idx[2]))
        if len(idx) == 4:
            tris.append((idx[0], idx[2], idx[3]))
    return tris


# ---------------------------------------------------------------------------- géométrie

def vertex_normals(pos, tris_v):
    n = np.zeros_like(pos)
    a, b, c = pos[tris_v[:, 0]], pos[tris_v[:, 1]], pos[tris_v[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tris_v[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def smooth_vectors(vec, tris_v, iterations=2):
    """Moyenne des vecteurs sur le voisinage (pour décaler les vêtements sans plis)."""
    nv = len(vec)
    for _ in range(iterations):
        acc = vec.copy()
        cnt = np.ones((nv, 1))
        for i, j in ((0, 1), (1, 2), (2, 0), (1, 0), (2, 1), (0, 2)):
            np.add.at(acc, tris_v[:, i], vec[tris_v[:, j]])
            np.add.at(cnt, tris_v[:, i], 1)
        vec = acc / cnt
        ln = np.linalg.norm(vec, axis=1, keepdims=True)
        ln[ln == 0] = 1
        vec = vec / ln
    return vec


def tube(points_src, loop, radius, sides, closed=True):
    """Tube autour d'une polyligne (sommets d'un maillage) ; renvoie triangles, positions, normales, sommet source."""
    pts = points_src[loop]
    n = len(pts)
    P, Nn, S, I = [], [], [], []
    for i in range(n):
        a = pts[(i - 1) % n] if closed or i > 0 else pts[i]
        b = pts[(i + 1) % n] if closed or i < n - 1 else pts[i]
        t = b - a
        t = t / (np.linalg.norm(t) or 1)
        up = np.array([0.0, 0.0, 1.0]) if abs(t[2]) < 0.9 else np.array([0.0, 1.0, 0.0])
        u = np.cross(t, up)
        u /= np.linalg.norm(u) or 1
        w = np.cross(t, u)
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            d = u * math.cos(ang) + w * math.sin(ang)
            P.append(pts[i] + d * radius)
            Nn.append(d)
            S.append(loop[i])
    segs = n if closed else n - 1
    for i in range(segs):
        j = (i + 1) % n
        for k in range(sides):
            k2 = (k + 1) % sides
            a, b, c, d = i * sides + k, i * sides + k2, j * sides + k2, j * sides + k
            I += [a, b, c, a, c, d]
    return np.array(I, np.uint32), np.array(P), np.array(Nn), np.array(S, np.int64)


class Part:
    """Un maillage exportable : sommets éclatés par UV, poids, matériau."""

    def __init__(self, name, material, pos, nrm, uv, joints, weights, indices):
        self.name = name
        self.material = material
        self.pos = np.asarray(pos, np.float32)
        self.nrm = np.asarray(nrm, np.float32)
        self.uv = None if uv is None else np.asarray(uv, np.float32)
        self.joints = np.asarray(joints, np.uint16)
        self.weights = np.asarray(weights, np.float32)
        self.indices = np.asarray(indices, np.uint32)


def build_part(name, material, tris, pos, nrm, uvs_table, joints, weights):
    """Éclate les sommets par couple (sommet, uv) et construit la liste d'indices."""
    key_to_new = {}
    P, N, U, J, W, I = [], [], [], [], [], []
    for tri in tris:
        for v, t in tri:
            key = (v, t)
            k = key_to_new.get(key)
            if k is None:
                k = len(P)
                key_to_new[key] = k
                P.append(pos[v])
                N.append(nrm[v])
                U.append(uvs_table[t] if (uvs_table is not None and t >= 0) else (0.0, 0.0))
                J.append(joints[v])
                W.append(weights[v])
            I.append(k)
    return Part(name, material, P, N, U if uvs_table is not None else None, J, W, I)


# ---------------------------------------------------------------------------- export GLB

class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.json = {
            'asset': {'version': '2.0', 'generator': 'gueule-de-bois build_hero.py',
                      'copyright': 'Données MakeHuman (CC0, makehuman.org) ; assemblage : Gueule de bois'},
            'buffers': [], 'bufferViews': [], 'accessors': [], 'meshes': [], 'nodes': [],
            'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
            'skins': [], 'scenes': [{'nodes': []}], 'scene': 0,
        }

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin.extend(data)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.json['bufferViews'].append(v)
        return len(self.json['bufferViews']) - 1

    def accessor(self, arr, ctype, atype, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        bv = self.view(arr.tobytes(), target)
        acc = {'bufferView': bv, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': atype}
        if normalized:
            acc['normalized'] = True
        if minmax:
            acc['min'] = [float(x) for x in arr.min(axis=0)]
            acc['max'] = [float(x) for x in arr.max(axis=0)]
        self.json['accessors'].append(acc)
        return len(self.json['accessors']) - 1

    def image(self, path):
        with open(path, 'rb') as f:
            data = f.read()
        bv = self.view(data)
        self.json['images'].append({'bufferView': bv, 'mimeType': 'image/png'})
        self.json['textures'].append({'sampler': 0, 'source': len(self.json['images']) - 1})
        return len(self.json['textures']) - 1

    def material(self, name, color=(1, 1, 1, 1), tex=None, normal=None, rough=0.8, alpha=None, double=False):
        m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': list(color), 'metallicFactor': 0.0, 'roughnessFactor': rough}}
        if tex is not None:
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex}
        if normal is not None:
            m['normalTexture'] = {'index': normal}
        if alpha:
            m['alphaMode'] = alpha
            if alpha == 'MASK':
                m['alphaCutoff'] = 0.4
        if double:
            m['doubleSided'] = True
        self.json['materials'].append(m)
        return len(self.json['materials']) - 1

    def write(self, path):
        self.json['buffers'].append({'byteLength': len(self.bin)})
        js = json.dumps(self.json, separators=(',', ':')).encode()
        while len(js) % 4:
            js += b' '
        while len(self.bin) % 4:
            self.bin.append(0)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A))
            f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942))
            f.write(self.bin)


# ---------------------------------------------------------------------------- construction

def main():
    if not os.path.isdir(DATA):
        sys.exit('Données absentes : lancer scripts/character/fetch_assets.sh')
    base = load_json('models/human_full_size.json')
    mats = [m['DbgName'] for m in base['materials']]
    verts = np.array(base['vertices'], np.float64).reshape(-1, 3)

    # 1. Morphing
    npz = np.load(os.path.join(CACHE, 'targets.npz'))
    for name, w in TARGETS.items():
        idx = npz[f'targets/{name}.index'].astype(np.int64)
        vec = npz[f'targets/{name}.vector'].astype(np.float64) * 1e-3
        verts[idx] += vec * w

    faces = parse_faces(base)
    body_mat = mats.index('body')
    body_tris = triangles(faces, lambda f: f[1] == body_mat)
    body_vids = sorted({v for tri in body_tris for v, _ in tri})

    # Mètres, pieds au sol, centré en x/z sur le bassin
    pos = verts * DM
    ground = pos[body_vids, 1].min()
    joints_idx = base['metadata']['joint_pos_idxs']

    def joint(n):
        return pos[joints_idx[n]].mean(axis=0)

    center = joint('spine05____head')
    offset = np.array([0.0, -ground, -center[2]])
    pos = pos + offset

    def J(n):
        return pos[joints_idx[n]].mean(axis=0)

    # 2. Squelette : un os par nœud « X____head », pivot au joint de tête, sans rotation
    bone_nodes = base['bones']
    names = [b['name'] for b in bone_nodes]
    bones = [n for n in names if not n.endswith('____head')]
    bone_index = {n: i for i, n in enumerate(bones)}
    parent = {}
    for i, n in enumerate(names):
        if n.endswith('____head'):
            p = bone_nodes[i]['parent']
            parent[n[:-8]] = None if p < 0 else names[p].replace('____head', '')
    heads = {b: J(b + '____head') for b in bones}

    # Poids du corps (4 influences), indices ramenés aux os réels
    si = np.array(base['skinIndices'], np.int64).reshape(-1, 4)
    sw = np.array(base['skinWeights'], np.float64).reshape(-1, 4)
    map_idx = np.array([bone_index[n.replace('____head', '')] for n in names])
    joints = map_idx[si]
    sw = sw / np.maximum(sw.sum(axis=1, keepdims=True), 1e-9)

    uv_table = np.array(base['uvs'][0], np.float64).reshape(-1, 2)
    uv_table[:, 1] = 1.0 - uv_table[:, 1]
    tv = np.array([[v for v, _ in tri] for tri in body_tris], np.int64)
    nrm = vertex_normals(pos, tv)

    parts = []
    glb = GLB()

    def tex(rel):
        return glb.image(os.path.join(DATA, rel))

    skin_tex = tex('skins/young_caucasian_male/textures/young_lightskinned_male_diffuse.png')
    m_skin = glb.material('skin', tex=skin_tex, rough=0.62)
    parts.append(build_part('body', m_skin, body_tris, pos, nrm, uv_table, joints, sw))

    # Informations utiles au jeu
    hipY = float(J('upperleg01.L____head')[1])
    neckY = float(J('neck01____head')[1])
    headJ = J('head____head')
    ankleL = J('foot.L____head')
    ankleR = J('foot.R____head')
    kneeY = float(J('lowerleg01.L____head')[1])
    height = float(pos[body_vids, 1].max())

    # dominant bone par sommet
    dom = [bones[joints[v][int(np.argmax(sw[v]))]] for v in range(len(pos))]
    body_set = set(body_vids)

    def region_tris(sel):
        return [tri for tri in body_tris if all(sel[v] for v, _ in tri)]

    def garment(name, material, sel, amount, smooth=3, uv=False):
        """Vêtement collant généré en décalant la région du corps le long des normales lissées."""
        tris = region_tris(sel)
        tvv = np.array([[v for v, _ in t] for t in tris], np.int64)
        n = smooth_vectors(nrm.copy(), tvv, smooth)
        off = amount(pos) if callable(amount) else amount
        gpos = pos + n * np.asarray(off).reshape(-1, 1)
        gn = vertex_normals(gpos, tvv)
        return build_part(name, material, tris, gpos, gn, uv_table if uv else None, joints, sw)

    N = len(pos)
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
    arm_bones = ('upperarm', 'lowerarm', 'shoulder01', 'clavicle')
    torso_bones = ('spine', 'breast', 'clavicle', 'shoulder01', 'pelvis', 'neck')
    hand_bones = ('wrist', 'finger', 'metacarpal', 'thumb')

    # --- Sweat : torse + bras jusqu'aux poignets, ample au ventre
    sweat_sel = np.zeros(N, bool)
    for v in body_vids:
        b = dom[v]
        if b.startswith(hand_bones) or b.startswith(('upperleg', 'lowerleg', 'foot', 'toe')):
            continue
        if b.startswith(arm_bones) or b.startswith(torso_bones):
            # col montant dans la nuque pour rejoindre la capuche
            if hipY + 0.035 < y[v] < neckY + 0.025 + 0.035 * min(1.0, max(0.0, (0.03 - z[v]) / 0.05)):
                sweat_sel[v] = True
    # Bouche les trous (sommets isolés non retenus entourés de sommets retenus)
    nb = [set() for _ in range(N)]
    for tri in body_tris:
        a, b, c = (v for v, _ in tri)
        nb[a].update((b, c)); nb[b].update((a, c)); nb[c].update((a, b))
    for _ in range(3):
        add = [v for v in body_vids if not sweat_sel[v] and nb[v] and y[v] < neckY + 0.07
               and sum(sweat_sel[u] for u in nb[v]) >= 0.6 * len(nb[v])]
        sweat_sel[add] = True
    wristL = J('wrist.L____head')
    for v in body_vids:
        if sweat_sel[v] and abs(x[v]) > abs(wristL[0]) - 0.035:
            sweat_sel[v] = False  # s'arrête au poignet

    def sweat_amount(p):
        belly = np.clip((1.25 - p[:, 1]) / 0.3, 0, 1)
        armness = np.clip((np.abs(p[:, 0]) - 0.18) / 0.1, 0, 1)
        collar = np.clip((p[:, 1] - (neckY - 0.1)) / 0.08, 0, 1)  # col ample, ne colle pas au cou
        return 0.014 + 0.018 * belly * (1 - armness) + 0.006 * armness + 0.012 * collar

    m_sweat = glb.material('hoodie', color=(0.55, 0.57, 0.6, 1), rough=0.95, double=True)
    parts.append(garment('hoodie', m_sweat, sweat_sel, sweat_amount, smooth=4))

    # --- Capuche relevée : tête et cou, ouverture autour du visage
    eyes = load_json('proxies/eyes/HighPolyEyes/HighPolyEyes.json')

    def fit(proxy):
        ref = np.array(proxy['ref_vIdxs'], np.int64)
        w = np.array(proxy['weights'], np.float64)
        o = np.array(proxy['offsets'], np.float64)
        p = (verts[ref] * w[:, :, None]).sum(axis=1) + o
        return p * DM + offset

    eye_pos = fit(eyes)
    eyesC = eye_pos.mean(axis=0)
    head_pts = pos[[v for v in body_vids if y[v] > neckY + 0.02]]
    hc = np.array([0.0, head_pts[:, 1].mean(), head_pts[:, 2].mean()])
    hood_sel = np.zeros(N, bool)
    for v in body_vids:
        if y[v] < neckY - (0.045 if abs(x[v]) < 0.07 and z[v] < 0.03 else 0.02):
            continue
        # Ouverture ovale du visage (front, yeux, bouche, menton, gorge)
        fx = x[v] / 0.078
        dy = y[v] - (eyesC[1] - 0.03)
        fy = dy / (0.09 if dy > 0 else 0.115)
        front = z[v] > hc[2] + 0.015
        if front and fx * fx + fy * fy < 1.0:
            continue
        if front and y[v] < eyesC[1] - 0.09 and abs(x[v]) < 0.07:
            continue  # sous le menton et la gorge : ouvert
        hood_sel[v] = True

    def hood_amount(p):
        back = np.clip((hc[2] - p[:, 2]) / 0.1, 0, 1)
        top = np.clip((p[:, 1] - eyesC[1]) / 0.1, 0, 1)
        neck = np.clip((hc[1] - 0.08 - p[:, 1]) / 0.08, 0, 1)
        return 0.022 + 0.02 * back + 0.012 * top + 0.008 * neck

    # La capuche suit une version lissée de la tête (sans oreilles ni nez), toujours à l'extérieur
    htris = region_tris(hood_sel)
    # Seule la plus grande composante connexe (écarte les îlots des orbites et de la bouche)
    comp = {v: v for t in htris for v, _ in t}

    def find(a):
        while comp[a] != a:
            comp[a] = comp[comp[a]]
            a = comp[a]
        return a
    for t in htris:
        r0 = find(t[0][0])
        for v, _ in t[1:]:
            comp[find(v)] = r0
    sizes = {}
    for v in comp:
        sizes[find(v)] = sizes.get(find(v), 0) + 1
    main_c = max(sizes, key=sizes.get)
    htris = [t for t in htris if find(t[0][0]) == main_c]
    htv = np.array([[v for v, _ in t] for t in htris], np.int64)
    hv = np.unique(htv)
    smooth_pos = pos.copy()
    # Oreilles aplaties sur le crâne (rayon des sommets voisins hors oreille) avant tout lissage
    ear_centres = []
    for side in (1, -1):
        ear = [v for v in body_vids if side * x[v] > 0.068 and neckY + 0.04 < y[v] < eyesC[1] + 0.05]
        ec = pos[ear].mean(axis=0)
        ear_centres.append(ec)
        dist_e = np.linalg.norm(pos[hv] - ec, axis=1)
        inside = hv[dist_e < 0.035]
        ring = hv[(dist_e > 0.04) & (dist_e < 0.06)]
        r_skull = np.linalg.norm(pos[ring] - hc, axis=1).mean()
        dirs = pos[inside] - hc
        smooth_pos[inside] = hc + dirs / np.linalg.norm(dirs, axis=1, keepdims=True) * r_skull
    for _ in range(25):
        acc = smooth_pos.copy()
        cnt = np.ones((N, 1))
        for i, j in ((0, 1), (1, 2), (2, 0), (1, 0), (2, 1), (0, 2)):
            np.add.at(acc, htv[:, i], smooth_pos[htv[:, j]])
            np.add.at(cnt, htv[:, i], 1)
        new = acc / cnt
        smooth_pos[hv] = new[hv]
    hn = smooth_vectors(vertex_normals(smooth_pos, htv), htv, 3)
    hood_pos = smooth_pos + hn * hood_amount(smooth_pos).reshape(-1, 1)
    # Garantit que la capuche englobe la tête (oreilles comprises) : le facteur d'agrandissement est
    # dilaté puis lissé sur le maillage, pour gonfler la capuche en douceur au lieu de former des pointes
    cvec = hood_pos[hv] - hc
    need = np.linalg.norm(pos[hv] - hc, axis=1) + 0.018
    have = np.linalg.norm(cvec, axis=1)
    def spread(ratio, dilate=4, total=14):
        """Dilate puis lisse un facteur d'agrandissement sur la capuche."""
        f = np.ones(N)
        f[hv] = ratio
        for it in range(total):
            acc = f.copy()
            cnt = np.ones(N)
            mx = f.copy()
            for i, j in ((0, 1), (1, 2), (2, 0), (1, 0), (2, 1), (0, 2)):
                np.add.at(acc, htv[:, i], f[htv[:, j]])
                np.add.at(cnt, htv[:, i], 1)
                np.maximum.at(mx, htv[:, i], f[htv[:, j]])
            f[hv] = (mx if it < dilate else acc / cnt)[hv]
        return f
    kf = spread(np.maximum(1.0, need / np.maximum(have, 1e-6)))
    hood_pos[hv] = hc + cvec * kf[hv, None]

    def relax(pts, n_it):
        for _ in range(n_it):
            acc = pts.copy()
            cnt = np.ones((N, 1))
            for i, j in ((0, 1), (1, 2), (2, 0), (1, 0), (2, 1), (0, 2)):
                np.add.at(acc, htv[:, i], pts[htv[:, j]])
                np.add.at(cnt, htv[:, i], 1)
            pts[hv] = (acc / cnt)[hv]
    # Adoucit les creux (conduit auditif), puis vérifie une dernière fois l'englobement
    relax(hood_pos, 6)
    cvec = hood_pos[hv] - hc
    have = np.linalg.norm(cvec, axis=1)
    kf = spread(np.maximum(1.0, (need - 0.006) / np.maximum(have, 1e-6)), 3, 10)
    hood_pos[hv] = hc + cvec * kf[hv, None]
    # Dans la nuque et sur le cou, la capuche retombe le long du corps au lieu de s'écarter
    neck_t = np.clip((hc[1] - 0.05 - pos[:, 1]) / 0.06, 0, 1)
    nn = smooth_vectors(nrm.copy(), htv, 4)
    neck_pos = pos + nn * 0.03
    hood_pos[hv] = hood_pos[hv] * (1 - neck_t[hv, None]) + neck_pos[hv] * neck_t[hv, None]
    relax(hood_pos, 3)
    parts.append(build_part('hood', m_sweat, htris, hood_pos, vertex_normals(hood_pos, htv), None, joints, sw))

    # Bord roulotté : tube le long du contour de l'ouverture
    edges = {}
    for t in htv:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            key = (min(a, b), max(a, b))
            edges[key] = edges.get(key, 0) + 1
    boundary = [e for e, c in edges.items() if c == 1]
    adj = {}
    for a, b in boundary:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    # Plus grande boucle frontale = contour du visage
    loops, seen = [], set()
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [q for q in adj[cur] if q != prev]
            if not nxt or nxt[0] == start or nxt[0] in seen:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur)
            loop.append(cur)
        loops.append(loop)
    face_loop = max(loops, key=lambda l: hood_pos[l, 2].mean() + len(l) * 1e-4)
    # Contour du visage adouci : lissage le long de la boucle (supprime les dents de scie)
    lp = hood_pos[face_loop].copy()
    for _ in range(12):
        lp = (np.roll(lp, 1, axis=0) + lp * 2 + np.roll(lp, -1, axis=0)) / 4
    hood_pos[face_loop] = lp
    # Pavillon de l'oreille : ses replis plissent la capuche. On retire ces triangles et on referme
    # le trou (bord partagé avec le reste de la capuche) par un éventail autour d'un sommet neuf.
    h_joints, h_w = joints.copy(), sw.copy()
    for ec in ear_centres:
        inner = np.zeros(len(hood_pos), bool)
        inner[:N] = np.linalg.norm(pos - ec, axis=1) < 0.042
        drop = [t for t in htris if any(inner[v] for v, _ in t)]
        keep = [t for t in htris if not any(inner[v] for v, _ in t)]
        kept_edges = set()
        for t in keep:
            vs = [v for v, _ in t]
            for k in range(3):
                kept_edges.add((vs[k], vs[(k + 1) % 3]))
        rim = set()
        for t in drop:
            vs = [v for v, _ in t]
            for k in range(3):
                a, b = vs[k], vs[(k + 1) % 3]
                if (b, a) in kept_edges:
                    rim.add((b, a))  # orientation du triangle conservé
        rv = sorted({v for e in rim for v in e})
        centre = hood_pos[rv].mean(axis=0)
        rad = np.linalg.norm(hood_pos[rv] - hc, axis=1).mean()
        centre = hc + (centre - hc) / np.linalg.norm(centre - hc) * rad
        nv = len(hood_pos)
        hood_pos = np.vstack([hood_pos, centre])
        near_v = rv[int(np.argmin(np.linalg.norm(hood_pos[rv] - centre, axis=1)))]
        h_joints = np.vstack([h_joints, joints[near_v]])
        h_w = np.vstack([h_w, sw[near_v]])
        htris = keep + [((b, -1), (a, -1), (nv, -1)) for a, b in rim]
        htv = np.array([[v for v, _ in t] for t in htris], np.int64)
        print('oreille :', len(drop), 'triangles remplacés par', len(rim))
    # Normales lissées pour un ombrage de tissu régulier
    hood_n = smooth_vectors(vertex_normals(hood_pos, htv), htv, 3)
    # Autour des oreilles (replis du pavillon), normales radiales : la capuche y est quasi sphérique
    for ec in ear_centres:
        w = np.clip(1.0 - (np.linalg.norm(hood_pos - ec, axis=1) - 0.045) / 0.03, 0, 1)[:, None]
        radial = (hood_pos - hc) / np.linalg.norm(hood_pos - hc, axis=1, keepdims=True)
        hood_n = hood_n * (1 - w) + radial * w
    hood_n /= np.linalg.norm(hood_n, axis=1, keepdims=True)
    parts[-1] = build_part('hood', m_sweat, htris, hood_pos, hood_n, None, h_joints, h_w)
    # Rentre sous la capuche ce qui dépasserait du corps (oreilles, arrière du crâne)
    head_v = np.array([v for v in body_vids if y[v] > neckY - 0.02], np.int64)
    bd = pos[head_v] - hc
    br = np.linalg.norm(bd, axis=1)
    hdir = hood_pos[hv] - hc
    hr = np.linalg.norm(hdir, axis=1)
    dots = (bd / br[:, None]) @ (hdir / hr[:, None]).T
    best = np.argmax(dots, axis=1)
    lim = hr[best] - 0.008
    tuck = (dots[np.arange(len(head_v)), best] > 0.996) & (br > lim)
    body_pos = pos.copy()
    body_pos[head_v[tuck]] = hc + bd[tuck] * (lim[tuck] / br[tuck])[:, None]
    parts[0] = build_part('body', m_skin, body_tris, body_pos, vertex_normals(body_pos, tv), uv_table, joints, sw)
    print('sommets rentrés sous la capuche :', int(tuck.sum()))
    rim_parts = tube(hood_pos, face_loop, 0.011, 8, closed=True)
    rim_tris, rim_pos, rim_n, rim_src = rim_parts
    parts.append(Part('hood_rim', m_sweat, rim_pos, rim_n, None, joints[rim_src], sw[rim_src], rim_tris))

    # --- Caleçon (sous le tutu)
    box_sel = np.zeros(N, bool)
    for v in body_vids:
        b = dom[v]
        if b.startswith(('pelvis', 'spine05', 'upperleg01', 'upperleg02', 'spine04', 'root')) and hipY - 0.2 < y[v] < hipY + 0.06:
            box_sel[v] = True
    m_boxer = glb.material('boxer', color=(0.27, 0.4, 0.62, 1), rough=0.9, double=True)
    parts.append(garment('boxer', m_boxer, box_sel, 0.011))

    # --- Chaussettes : haute et rayée côté basket (gauche, x > 0), noire côté ville
    sockL = np.zeros(N, bool)
    sockR = np.zeros(N, bool)
    for v in body_vids:
        b = dom[v]
        if not b.startswith(('lowerleg', 'foot', 'toe')):
            continue
        if x[v] > 0 and y[v] < ankleL[1] + 0.33:
            sockL[v] = True
        if x[v] < 0 and y[v] < ankleR[1] + 0.1:
            sockR[v] = True
    m_sockL = glb.material('sock_striped', color=(1, 1, 1, 1), rough=0.95)
    m_sockR = glb.material('sock_dark', color=(0.08, 0.08, 0.09, 1), rough=0.9)
    parts.append(garment('sock_striped', m_sockL, sockL, 0.004))
    parts.append(garment('sock_dark', m_sockR, sockR, 0.003))

    # 3. Proxies : yeux, sourcils, cils, chaussures dépareillées
    def proxy_part(rel, name, material, side=0, max_y=None, keep=None):
        pj = load_json(rel)
        ppos = fit(pj)
        pf = parse_faces(pj)
        if side:
            pf = [f for f in pf if np.sign(ppos[f[0], 0].mean()) == side]
        if max_y is not None:
            pf = [f for f in pf if ppos[f[0], 1].mean() < max_y]
        if keep is not None:
            pf = [f for f in pf if keep(ppos[f[0]].mean(axis=0))]
        ptris = triangles(pf)
        ptv = np.array([[v for v, _ in t] for t in ptris], np.int64)
        pn = vertex_normals(ppos, ptv)
        pj_joints, pj_weights = blend_weights(pj)
        puv = np.array(pj['uvs'][0], np.float64).reshape(-1, 2)
        puv[:, 1] = 1 - puv[:, 1]
        return build_part(name, material, ptris, ppos, pn, puv, pj_joints, pj_weights)

    def blend_weights(pj):
        """Poids d'un proxy : mélange des poids des 3 sommets du corps auxquels il est accroché."""
        ref = np.array(pj['ref_vIdxs'], np.int64)
        bw = np.abs(np.array(pj['weights'], np.float64))
        out_j = np.zeros((len(ref), 4), np.int64)
        out_w = np.zeros((len(ref), 4), np.float64)
        for i in range(len(ref)):
            acc = {}
            for k in range(3):
                v = ref[i, k]
                for j in range(4):
                    if sw[v, j] > 0:
                        acc[joints[v, j]] = acc.get(joints[v, j], 0) + sw[v, j] * bw[i, k]
            best = sorted(acc.items(), key=lambda t: -t[1])[:4]
            tot = sum(w for _, w in best) or 1
            for j, (bj, w) in enumerate(best):
                out_j[i, j] = bj
                out_w[i, j] = w / tot
        return out_j, out_w

    def proxy_tex(rel_dir, pj_rel, key='mapDiffuse'):
        pj = load_json(pj_rel)
        t = pj['materials'][0].get(key)
        return tex(os.path.join(rel_dir, t)) if t else None

    eye_dir = 'proxies/eyes/HighPolyEyes'
    brown = os.path.join(DATA, eye_dir, 'textures', 'brown_eye.png')
    eye_tex = glb.image(brown) if os.path.exists(brown) else proxy_tex(eye_dir, eye_dir + '/HighPolyEyes.json')
    # Yeux « Low-Poly » (une seule couche : la cornée transparente des yeux HighPoly s'affiche opaque)
    parts.append(proxy_part('proxies/eyes/Low-Poly/Low-Poly.json', 'eyes', glb.material('eyes', tex=eye_tex, rough=0.15)))
    for rel, nm in (('proxies/eyebrows/eyebrow001/eyebrow001.json', 'eyebrows'), ('proxies/eyelashes/Eyelashes01/Eyelashes01.json', 'eyelashes')):
        d = os.path.dirname(rel)
        t = proxy_tex(d, rel)
        parts.append(proxy_part(rel, nm, glb.material(nm, tex=t, rough=0.9, alpha='MASK', double=True)))

    s5 = 'proxies/clothes/shoes05'
    s1 = 'proxies/clothes/shoes01'
    m_sneaker = glb.material('sneaker', tex=proxy_tex(s5, s5 + '/shoes05.json'), normal=proxy_tex(s5, s5 + '/shoes05.json', 'mapNormal'), rough=0.7)
    m_leather = glb.material('leather', tex=proxy_tex(s1, s1 + '/shoes01.json'), normal=proxy_tex(s1, s1 + '/shoes01.json', 'mapNormal'), rough=0.35)
    parts.append(proxy_part(s5 + '/shoes05.json', 'sneaker', m_sneaker, side=1, max_y=ankleL[1] + 0.035))
    parts.append(proxy_part(s1 + '/shoes01.json', 'leather', m_leather, side=-1, max_y=ankleR[1] + 0.03))

    # 4. Export
    js = glb.json
    for b in bones:
        p = parent[b]
        t = heads[b] - (heads[p] if p else 0)
        # GLTFLoader retire les points des noms : « upperarm01.L » devient « upperarm01_L »
        js['nodes'].append({'name': b.replace('.', '_'), 'translation': [float(v) for v in t]})
    for b in bones:
        p = parent[b]
        if p:
            js['nodes'][bone_index[p]].setdefault('children', []).append(bone_index[b])
    root_bones = [bone_index[b] for b in bones if parent[b] is None]

    # Ancres (nœuds enfants d'os) pour attacher lunettes et tutu dans le jeu
    def anchor(name, bone, world):
        js['nodes'].append({'name': name, 'translation': [float(v) for v in (world - heads[bone])]})
        js['nodes'][bone_index[bone]].setdefault('children', []).append(len(js['nodes']) - 1)

    anchor('anchor_glasses', 'head', np.array([0.0, eyesC[1] + 0.004, eyesC[2] + 0.028]))
    waist = pos[[v for v in body_vids if abs(y[v] - (hipY + 0.07)) < 0.01 and abs(x[v]) < 0.16 and dom[v].startswith(('spine', 'pelvis', 'root'))]]
    print('taille : z', waist[:, 2].min(), waist[:, 2].max(), 'x', waist[:, 0].min(), waist[:, 0].max())
    anchor('anchor_tutu', 'spine05', np.array([0.0, hipY + 0.06, float((waist[:, 2].min() + waist[:, 2].max()) / 2)]))

    ibm = np.zeros((len(bones), 4, 4), np.float32)
    for i, b in enumerate(bones):
        m = np.eye(4, dtype=np.float32)
        m[:3, 3] = -heads[b]
        ibm[i] = m.T  # glTF : colonne majeure
    ibm_acc = glb.accessor(ibm.reshape(-1, 16), 5126, 'MAT4')
    js['skins'].append({'joints': list(range(len(bones))), 'inverseBindMatrices': ibm_acc, 'skeleton': root_bones[0]})

    mesh_prims = []
    for p in parts:
        attrs = {
            'POSITION': glb.accessor(p.pos, 5126, 'VEC3', 34962, minmax=True),
            'NORMAL': glb.accessor(p.nrm, 5126, 'VEC3', 34962),
            'JOINTS_0': glb.accessor(p.joints, 5123, 'VEC4', 34962),
            'WEIGHTS_0': glb.accessor(p.weights, 5126, 'VEC4', 34962),
        }
        if p.uv is not None:
            attrs['TEXCOORD_0'] = glb.accessor(p.uv, 5126, 'VEC2', 34962)
        mesh_prims.append((p.name, {'attributes': attrs, 'indices': glb.accessor(p.indices, 5125, 'SCALAR', 34963), 'material': p.material}))

    hero_children = list(root_bones)
    for name, prim in mesh_prims:
        js['meshes'].append({'name': name, 'primitives': [prim]})
        js['nodes'].append({'name': name, 'mesh': len(js['meshes']) - 1, 'skin': 0})
        hero_children.append(len(js['nodes']) - 1)
    js['nodes'].append({
        'name': 'hero',
        'children': hero_children,
        'extras': {'height': height, 'hipY': hipY, 'neckY': neckY, 'kneeY': kneeY, 'eyesY': float(eyesC[1]),
                   'headY': float(headJ[1]), 'chestZ': float(pos[[v for v in body_vids if abs(y[v] - (neckY - 0.18)) < 0.01], 2].max())},
    })
    js['scenes'][0]['nodes'] = [len(js['nodes']) - 1]
    glb.write(OUT)
    tri_count = sum(len(p.indices) // 3 for p in parts)
    print(f'{OUT} : {os.path.getsize(OUT) / 1e6:.2f} Mo, {len(bones)} os, {tri_count} triangles, taille {height:.2f} m')
    for p in parts:
        print(f'  {p.name:14s} {len(p.pos):6d} sommets {len(p.indices) // 3:6d} triangles')


if __name__ == '__main__':
    main()
