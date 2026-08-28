"""CUDA driver API tax vs a 0.1ms MSC budget. No MSC algorithm on GPU."""
from __future__ import annotations

import ctypes
import time
from ctypes import POINTER, c_int, c_void_p, c_size_t, c_uint, c_ulonglong

N = 333792


def _load():
    try:
        return ctypes.WinDLL("nvcuda.dll")
    except OSError as exc:
        raise SystemExit(f"nvcuda.dll not loadable: {exc}")


def main() -> None:
    cuda = _load()
    cuda.cuInit.argtypes = [c_uint]
    cuda.cuDeviceGet.argtypes = [POINTER(c_int), c_int]
    cuda.cuCtxCreate_v2.argtypes = [POINTER(c_void_p), c_uint, c_int]
    cuda.cuMemAlloc_v2.argtypes = [POINTER(c_ulonglong), c_size_t]
    cuda.cuMemcpyHtoD_v2.argtypes = [c_ulonglong, c_void_p, c_size_t]
    cuda.cuMemcpyDtoH_v2.argtypes = [c_void_p, c_ulonglong, c_size_t]
    cuda.cuMemFree_v2.argtypes = [c_ulonglong]

    t0 = time.perf_counter()
    rc = cuda.cuInit(0)
    print(f"cuInit_rc={rc} cuInit_ms={(time.perf_counter() - t0) * 1000:.3f}")
    if rc != 0:
        raise SystemExit("cuInit failed")

    dev = c_int()
    cuda.cuDeviceGet(ctypes.byref(dev), 0)
    ctx = c_void_p()
    t0 = time.perf_counter()
    rc = cuda.cuCtxCreate_v2(ctypes.byref(ctx), 0, dev)
    print(f"cuCtxCreate_rc={rc} cuCtxCreate_ms={(time.perf_counter() - t0) * 1000:.3f}")
    if rc != 0:
        raise SystemExit("cuCtxCreate failed")

    host = (ctypes.c_ubyte * N)()
    allocs = []
    h2d = []
    d2h = []
    for i in range(40):
        ptr = c_ulonglong()
        t0 = time.perf_counter()
        rc = cuda.cuMemAlloc_v2(ctypes.byref(ptr), N)
        a = (time.perf_counter() - t0) * 1000
        t0 = time.perf_counter()
        rc2 = cuda.cuMemcpyHtoD_v2(ptr, host, N)
        b = (time.perf_counter() - t0) * 1000
        t0 = time.perf_counter()
        rc3 = cuda.cuMemcpyDtoH_v2(host, ptr, N)
        c = (time.perf_counter() - t0) * 1000
        cuda.cuMemFree_v2(ptr)
        if i == 0:
            print(f"first_alloc_ms={a:.3f} first_h2d_333kb_ms={b:.3f} first_d2h_ms={c:.3f} rc={rc},{rc2},{rc3}")
        else:
            allocs.append(a)
            h2d.append(b)
            d2h.append(c)
    print(
        f"warm_min_alloc_ms={min(allocs):.3f} h2d_333kb_ms={min(h2d):.3f} d2h_ms={min(d2h):.3f}"
    )
    print(
        f"warm_mean_alloc_ms={sum(allocs)/len(allocs):.3f} h2d_333kb_ms={sum(h2d)/len(h2d):.3f} d2h_ms={sum(d2h)/len(d2h):.3f}"
    )


if __name__ == "__main__":
    main()
