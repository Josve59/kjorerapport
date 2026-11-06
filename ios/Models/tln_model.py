# TwinLiteNet+ (MIT, chequanghuy/TwinLiteNetPlus), skrevet av etter model/model.py: samme lagnavn, så vektene passer.
import torch, torch.nn as nn, torch.nn.functional as F
CFG = {"nano": (1, 1, [4, 8, 16, 32, 64]), "small": (2, 3, [8, 16, 32, 64, 128]),
       "medium": (3, 5, [16, 32, 64, 128, 256]), "large": (5, 7, [32, 64, 128, 256, 512])}
def patch_split(x, b):
    B, C, H, W = x.size(); rH, rW = H // b[0], W // b[1]
    return x.view(B, C, b[0], rH, b[1], rW).permute(0, 2, 4, 3, 5, 1).contiguous().view(B, -1, rH, rW, C)
def patch_recover(x, b):
    B, N, rH, rW, C = x.size()
    return x.view(B, b[0], b[1], rH, rW, C).permute(0, 5, 1, 3, 2, 4).contiguous().view(B, C, rH * b[0], rW * b[1])
class GCN(nn.Module):
    def __init__(s, n, c): super().__init__(); s.conv1 = nn.Conv2d(n, n, 1, bias=False); s.relu = nn.PReLU(n); s.conv2 = nn.Linear(c, c, bias=False)
    def forward(s, x): return s.conv2(s.relu(s.conv1(x) + x))
class CAAM(nn.Module):
    def __init__(s, feat_in, num_classes, bin_size):
        super().__init__(); fi = feat_in // 2; s.bin_size = bin_size
        s.conv_cam = nn.Conv2d(feat_in, num_classes, 1); s.pool_cam = nn.AdaptiveAvgPool2d(bin_size); s.sigmoid = nn.Sigmoid()
        bn = bin_size[0] * bin_size[1]; s.gcn = GCN(bn, feat_in); s.fuse = nn.Conv2d(bn, 1, 1)
        s.proj_query = nn.Linear(feat_in, fi); s.proj_key = nn.Linear(feat_in, fi); s.proj_value = nn.Linear(feat_in, fi)
        s.conv_out = nn.Sequential(nn.Conv2d(fi, feat_in, 1, bias=False), nn.BatchNorm2d(feat_in), nn.PReLU(feat_in)); s.relu = nn.PReLU(1)
    def forward(s, x):
        cam = s.conv_cam(x); cls_score = s.sigmoid(s.pool_cam(cam)); residual = x
        cam = patch_split(cam, s.bin_size); x = patch_split(x, s.bin_size)
        B, rH, rW, K, C = cam.shape[0], cam.shape[2], cam.shape[3], cam.shape[-1], x.shape[-1]
        cam = cam.view(B, -1, rH * rW, K); x = x.view(B, -1, rH * rW, C)
        bin_conf = cls_score.view(B, K, -1).transpose(1, 2).unsqueeze(3)
        pix = F.softmax(cam, dim=2)
        local = s.gcn(torch.matmul(pix.transpose(2, 3), x) * bin_conf)
        glob = s.relu(s.fuse(local)).repeat(1, x.shape[1], 1, 1)
        q, k, v = s.proj_query(x), s.proj_key(local), s.proj_value(glob)
        out = torch.matmul(F.softmax(torch.matmul(q, k.transpose(2, 3)), dim=-1), v)
        out = patch_recover(out.view(B, -1, rH, rW, v.shape[-1]), s.bin_size)
        return residual + s.conv_out(out)
class CBR(nn.Module):
    def __init__(s, i, o, k=3, stride=1):
        super().__init__(); s.conv = nn.Conv2d(i, o, k, stride=stride, padding=(k - 1) // 2, bias=False); s.bn = nn.BatchNorm2d(o); s.act = nn.PReLU(o)
    def forward(s, x): return s.act(s.bn(s.conv(x)))
class DC(nn.Module):
    def __init__(s, i, o, k, stride=1, d=1): super().__init__(); s.conv = nn.Conv2d(i, o, k, stride=stride, padding=(k - 1) // 2 * d, bias=False, dilation=d)
    def forward(s, x): return s.conv(x)
class BR(nn.Module):
    def __init__(s, o): super().__init__(); s.bn = nn.BatchNorm2d(o, eps=1e-3); s.act = nn.PReLU(o)
    def forward(s, x): return s.act(s.bn(x))
class DSC(nn.Module):
    def __init__(s, i, o, k=3, stride=1, d=1):
        super().__init__(); s.depthwise = nn.Conv2d(i, i, k, stride, (k - 1) // 2 * d, d, groups=i, bias=False); s.pointwise = nn.Conv2d(i, o, 1, bias=False)
    def forward(s, x): return s.pointwise(s.depthwise(x))
class StrideESP(nn.Module):
    def __init__(s, i, o):
        super().__init__(); n = int(o / 5); n1 = o - 4 * n
        s.c1 = DC(i, n, 3, 2); s.d1 = DC(n, n1, 3, 1, 1); s.d2 = DC(n, n, 3, 1, 2); s.d4 = DC(n, n, 3, 1, 4); s.d8 = DC(n, n, 3, 1, 8); s.d16 = DC(n, n, 3, 1, 16)
        s.bn = nn.BatchNorm2d(o, eps=1e-3); s.act = nn.PReLU(o)
    def forward(s, x):
        o1 = s.c1(x); a1 = s.d2(o1); a2 = a1 + s.d4(o1); a3 = a2 + s.d8(o1); a4 = a3 + s.d16(o1)
        return s.act(s.bn(torch.cat([s.d1(o1), a1, a2, a3, a4], 1)))
class DepthwiseESP(nn.Module):
    def __init__(s, i, o):
        super().__init__(); n = max(int(o / 5), 1); n1 = max(o - 4 * n, 1)
        s.c1 = DSC(i, n, 1, 1); s.d1 = DSC(n, n1, 3, 1, 1); s.d2 = DSC(n, n, 3, 1, 2); s.d4 = DSC(n, n, 3, 1, 4); s.d8 = DSC(n, n, 3, 1, 8); s.d16 = DSC(n, n, 3, 1, 16)
        s.bn = BR(o)
    def forward(s, x):
        o1 = s.c1(x); a1 = s.d2(o1); a2 = a1 + s.d4(o1); a3 = a2 + s.d8(o1); a4 = a3 + s.d16(o1)
        return s.bn(x + torch.cat([s.d1(o1), a1, a2, a3, a4], 1))
class AvgDown(nn.Module):
    def __init__(s, n): super().__init__(); s.pool = nn.ModuleList([nn.AvgPool2d(3, stride=2, padding=1) for _ in range(n)])
    def forward(s, x):
        for p in s.pool: x = p(x)
        return x
class Encoder(nn.Module):
    def __init__(s, cfg):
        super().__init__(); p, q, c = CFG[cfg]
        s.level1 = CBR(3, c[0], stride=2); s.sample1 = AvgDown(1); s.sample2 = AvgDown(2)
        s.b1 = CBR(c[0] + 3, c[1]); s.level2_0 = StrideESP(c[1], c[2])
        s.level2 = nn.ModuleList([DepthwiseESP(c[2], c[2]) for _ in range(p)])
        s.b2 = CBR(c[3] + 3, c[3] + 3); s.level3_0 = StrideESP(c[3] + 3, c[3])
        s.level3 = nn.ModuleList([DepthwiseESP(c[3], c[3]) for _ in range(q)])
        s.b3 = CBR(c[4], c[2])
    def forward(s, x):
        o0 = s.level1(x); i1 = s.sample1(x); i2 = s.sample2(x)
        o0c = s.b1(torch.cat([o0, i1], 1)); o10 = s.level2_0(o0c); o1 = o10
        for l in s.level2: o1 = l(o1)
        o1c = s.b2(torch.cat([o1, o10, i2], 1)); o20 = s.level3_0(o1c); o2 = o20
        for l in s.level3: o2 = l(o2)
        return s.b3(torch.cat([o20, o2], 1)), i1, i2
class UpSimple(nn.Module):
    def __init__(s, i, o): super().__init__(); s.deconv = nn.ConvTranspose2d(i, o, 2, stride=2, bias=False); s.bn = nn.BatchNorm2d(o, eps=1e-3); s.act = nn.PReLU(o)
    def forward(s, x): return s.act(s.bn(s.deconv(x)))
class UpConv(nn.Module):
    def __init__(s, i, o, sub=3, last=False):
        super().__init__(); s.last = last; s.up_conv = UpSimple(i, o)
        if not last: s.conv1 = CBR(o + sub, o)
        s.conv2 = CBR(o, o)
    def forward(s, x, ori=None):
        x = s.up_conv(x)
        if not s.last: x = s.conv1(torch.cat([x, ori], 1))
        return s.conv2(x)
class TwinLiteNetPlus(nn.Module):
    def __init__(s, cfg="large"):
        super().__init__(); c = CFG[cfg][2]
        s.encoder = Encoder(cfg); s.caam = CAAM(c[2], c[2], (2, 4)); s.conv_caam = CBR(c[2], c[1])
        s.up_1_da = UpConv(c[1], c[0]); s.up_2_da = UpConv(c[0], 8); s.out_da = UpConv(8, 2, last=True)
        s.up_1_ll = UpConv(c[1], c[0]); s.up_2_ll = UpConv(c[0], 8); s.out_ll = UpConv(8, 2, last=True)
    def forward(s, x):
        e, i1, i2 = s.encoder(x); c = s.conv_caam(s.caam(e))
        da = s.out_da(s.up_2_da(s.up_1_da(c, i2), i1)); ll = s.out_ll(s.up_2_ll(s.up_1_ll(c, i2), i1))
        return da, ll
def load(cfg, path):
    m = TwinLiteNetPlus(cfg); sd = torch.load(path, map_location="cpu", weights_only=True)
    if isinstance(sd, dict) and "state_dict" in sd: sd = sd["state_dict"]
    sd = {k.replace("module.", "", 1): v for k, v in sd.items()}
    missing, unexpected = m.load_state_dict(sd, strict=True), None
    return m.eval()
