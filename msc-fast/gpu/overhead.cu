/* Cold/warm CUDA launch + memcpy cost vs the 0.1ms MSC target.
 * MSC decompile/compile is branchy graph work, not a dense kernel.
 * This file only measures the GPU tax; it does not decompile MSC.
 */
#include <cuda_runtime.h>
#include <stdio.h>
#include <stdint.h>
#include <chrono>

__global__ void empty_kernel() {}

static double ms_since(std::chrono::high_resolution_clock::time_point start) {
    auto now = std::chrono::high_resolution_clock::now();
    return std::chrono::duration<double, std::milli>(now - start).count();
}

int main() {
    const size_t n = 333792;
    void* device = nullptr;
    char* host = (char*)malloc(n);
    if (!host) {
        fprintf(stderr, "host alloc failed\n");
        return 1;
    }
    for (size_t i = 0; i < n; i++) host[i] = (char)i;

    auto cold = std::chrono::high_resolution_clock::now();
    cudaError_t err = cudaFree(0);
    if (err != cudaSuccess) {
        fprintf(stderr, "cudaFree(0) %s\n", cudaGetErrorString(err));
        return 1;
    }
    printf("cuda_context_init_ms=%.3f\n", ms_since(cold));

    double alloc_ms = 0, h2d_ms = 0, launch_ms = 0, d2h_ms = 0;
    for (int iter = 0; iter < 50; iter++) {
        auto t0 = std::chrono::high_resolution_clock::now();
        cudaMalloc(&device, n);
        double a = ms_since(t0);

        t0 = std::chrono::high_resolution_clock::now();
        cudaMemcpy(device, host, n, cudaMemcpyHostToDevice);
        double b = ms_since(t0);

        t0 = std::chrono::high_resolution_clock::now();
        empty_kernel<<<1, 1>>>();
        cudaDeviceSynchronize();
        double c = ms_since(t0);

        t0 = std::chrono::high_resolution_clock::now();
        cudaMemcpy(host, device, n, cudaMemcpyDeviceToHost);
        double d = ms_since(t0);

        cudaFree(device);
        device = nullptr;
        if (iter == 0) {
            printf("warm0_alloc_ms=%.3f h2d_333kb_ms=%.3f empty_kernel_ms=%.3f d2h_ms=%.3f\n", a, b, c, d);
        } else {
            alloc_ms += a; h2d_ms += b; launch_ms += c; d2h_ms += d;
        }
    }
    printf("warm_mean_alloc_ms=%.3f h2d_333kb_ms=%.3f empty_kernel_ms=%.3f d2h_ms=%.3f\n",
           alloc_ms / 49.0, h2d_ms / 49.0, launch_ms / 49.0, d2h_ms / 49.0);
    free(host);
    return 0;
}
