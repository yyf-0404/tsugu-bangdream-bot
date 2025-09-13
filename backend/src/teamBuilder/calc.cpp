#include <random>
#include <array>
#include <chrono>
#include <algorithm>
#pragma GCC optimize("Ofast,unroll-loops")
#pragma GCC target("avx2,bmi,popcnt,fma")
#include <immintrin.h>
#include <iostream>
#define N 65536
const int K = 10;
using namespace std;
void reorder(int *tar, const int *ord, int *tmp, int n) {
    for (int i = 0; i < n; ++i) tmp[i] = tar[ord[i]];
    for (int i = 0; i < n; ++i) tar[i] = tmp[i];
}

#ifdef _WIN32
    #define EXPORT __declspec(dllexport)
#else
    #define EXPORT
#endif

extern "C" EXPORT int calc2(int n, int ans, int *a, int *b, int *output);

extern "C" EXPORT int calc1(int n, int ans, int *a, int *b, int *output) {
    alignas(64) int S[N] = {0}, S_[N] = {0};
    alignas(64) int f[3][N] = {{0}};
    int order[3][N] = {{0}};
    int order_[N] = {0};
    int tmp[N] = {0};
    for (int i = 0; i < n; i++) {
        S[i] = a[i];
    }

    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < n; j++) {
            f[i][j] = b[3 * j + i];
        }
        for (int j = 0; j < n; j++)
            order[i][j] = j;
        sort(order[i], order[i] + n, [&](int j, int k) { return f[i][j] < f[i][k]; });
        // if (i == 2)
        reverse(order[i], order[i] + n);
    }
    for (int i = 0; i < n; ++i) order_[order[2][i]] = i;

    reorder(S, order[2], tmp, n);
    reorder(f[0], order[2], tmp, n);
    reorder(f[1], order[2], tmp, n);
    reorder(f[2], order[2], tmp, n);
    
    // f[i][order[i][j]] -> f_0[i][order[2][order[i][j]]]
    // order[i][j] -> order[2][order[i][j]]
    for (int i = 0; i < 2; ++i) {
        for (int j = 0; j < n; ++j) tmp[j] = order_[order[i][j]];
        for (int j = 0; j < n; ++j) order[i][j] = tmp[j];
    }
    
    for (int i = 0; i < n; ++i) S_[i] = S[order[1][i]];

    int I = 0, J = 0, K = 0;

    int tot = 0;

    const int she = 2e9;

    for (int ii = 0; ii < n; ++ii) {
        int i = order[0][ii];
        if (f[0][i] + f[1][order[1][0]] + f[2][0] <= ans)
            break;
        auto vecii = _mm256_set1_epi32(S[i]);
        auto zero = _mm256_setzero_si256();
        int jj;
        for (jj = 0; jj <= n - 8; jj += 8) {
            __m256i filter = _mm256_load_si256((__m256i *)(S_ + jj));
            filter = _mm256_cmpeq_epi32(vecii & filter, zero);
            int lowmsk_ = _mm256_movemask_ps(_mm256_castsi256_ps(filter));
            while (lowmsk_) {
                int j = __builtin_ctz(lowmsk_);
                lowmsk_ ^= (1 << j);
                j = order[1][jj + j];
                if (f[0][i] + f[1][j] + f[2][0] <= ans)
                    goto outer;
                auto vecsij = _mm256_set1_epi32(S[i] | S[j]);
                __m256i vecsk;
                int lowmsk, pos, tans;
                int kpos = 0;
                for (; kpos + 8 <= n; kpos += 8) {
                    if(++tot > she) {
                        // cout << "killed\n";
                        for (int i = 0; i < 3; i++) {
                            output[i] = order[2][output[i]];
                        }
                        return calc2(n, ans, a, b, output);
                    }
                    if (f[0][i] + f[1][j] + f[2][kpos] <= ans) {
                        goto outer_break;
                    }
                    vecsk = _mm256_load_si256((__m256i *)(S + kpos));
                    vecsk = _mm256_cmpeq_epi32(vecsij & vecsk, zero);
                    if ((lowmsk = _mm256_movemask_ps(_mm256_castsi256_ps(vecsk))) != 0)
                        goto jump_label;
                }
                for (; kpos < n; ++kpos) {
                    if (f[0][i] + f[1][j] + f[2][kpos] <= ans)
                        break;
                    if ((S[i] | S[j]) & S[kpos])
                        continue;
                    ans = f[0][i] + f[1][j] + f[2][kpos];
                    output[0] = I = i;
                    output[1] = J = j;
                    output[2] = K = kpos;
                }
                goto outer_break;
            jump_label:
                pos = __builtin_ctz(lowmsk);
                tans = f[0][i] + f[1][j] + f[2][kpos + pos];
                if (ans < tans) {
                    ans = tans;
                    output[0] = I = i;
                    output[1] = J = j;
                    output[2] = K = kpos + pos;
                }
            outer_break:;
            }
        }
        for (; jj < n; ++jj) {
            int j = order[1][jj];
            if (S[i] & S[j])
                continue;
            if (f[0][i] + f[1][j] + f[2][0] <= ans)
                goto outer;
            auto vecsij = _mm256_set1_epi32(S[i] | S[j]);
            __m256i vecsk;
            int lowmsk, pos, tans;
            int kpos = 0;
            for (; kpos + 8 <= n; kpos += 8) {
                if (f[0][i] + f[1][j] + f[2][kpos] <= ans) {
                    goto outer_break1;
                }
                vecsk = _mm256_load_si256((__m256i *)(S + kpos));
                vecsk = _mm256_cmpeq_epi32(vecsij & vecsk, zero);
                if ((lowmsk = _mm256_movemask_ps(_mm256_castsi256_ps(vecsk))) != 0)
                    goto jump_label1;
            }
            for (; kpos < n; kpos++) {
                if (f[0][i] + f[1][j] + f[2][kpos] <= ans)
                    break;
                if ((S[i] | S[j]) & S[kpos])
                    continue;
                ans = f[0][i] + f[1][j] + f[2][kpos];
                output[0] = I = i;
                output[1] = J = j;
                output[2] = K = kpos;
            }
            goto outer_break1;
        jump_label1:
            pos = __builtin_ctz(lowmsk);
            tans = f[0][i] + f[1][j] + f[2][kpos + pos];
            if (ans < tans) {
                ans = tans;
                output[0] = I = i;
                output[1] = J = j;
                output[2] = K = kpos + pos;
            }
        outer_break1:;
        }
    outer:;
    }
    for (int i = 0; i < 3; i++) {
        output[i] = order[2][output[i]];
    }
    // assert((S[I] & S[J]) == 0 && (S[J] & S[K]) == 0 && (S[K] & S[I]) == 0 &&
    //        ans == f[0][I] + f[1][J] + f[2][K]);
    return ans;
}

extern "C" EXPORT int calc2(int n, int ans, int *a, int *b, int *output) {
    // 这是因为我懒得写大小为 32 的边界了。
    alignas(64) int f[N][4] = {{0}};
    alignas(64) unsigned char xx[N * 10] = {0};
    alignas(64) short mp[32] = {0};
    alignas(64) unsigned char mplow[32] = {0};
    alignas(64) unsigned char mphi[32] = {0};
    alignas(64) int ff[1 << K][8] = {{0}};
    mt19937 rnd(114514);
    alignas(64) int prec[3 * 3 * 3 * 3 * 3 * 3 * 3 * 3 * 3 * 3 * 3];
    int preccnt = 0;
    fill((int *)f, (int *)f + N * 4, 0);

    for (int i = 0; i < n; ++i) {
        int t = a[i];
        for (int j = 0; j < 5; ++j) {
            int r = __builtin_ctz(t);
            t = t - (1 << r);
            xx[(i / 32) * 160 + j * 32 + i % 32] = (r & 15) | ((r & 16) << 3);  // >=16 -> +112
        }
    }
    int Mx[3] = {0};
    for (int i = 0; i < n; ++i) {
        f[i][0] = b[3 * i];
        Mx[0] = max(Mx[0], f[i][0]);
    }
    for (int i = 0; i < n; ++i) {
        f[i][1] = b[3 * i + 1];
        Mx[1] = max(Mx[1], f[i][1]);
    }
    for (int i = 0; i < n; ++i) {
        f[i][2] = b[3 * i + 2];
        Mx[2] = max(Mx[2], f[i][2]);
    }
    if (Mx[0] + Mx[1] + Mx[2] <= ans)
        return ans;
    int tot = 1;
    for (int i = 0; i < K; ++i) tot = tot * 3;
    for (int i = 0; i < tot; ++i) {
        array<int, 3> t = { 0, 0, 0 };
        int pow3 = 1;
        for (int j = 0; j < K; ++j) {
            int num = i / pow3 % 3;
            t[num] += (1 << j);
            pow3 = pow3 * 3;
        }
        if (__builtin_popcount(t[0]) <= 5 && __builtin_popcount(t[1]) <= 5) {
            for (int j = 0; j < 3; ++j)
                prec[preccnt / 8 * 24 + j * 8 + preccnt % 8] = t[j] * 8;  // index of (int*)ff
            ++preccnt;
        }
    }
    while (preccnt % 8)  // 避免大小为 8 的边界
    {
        for (int j = 0; j < 3; ++j)
            prec[preccnt / 8 * 24 + j * 8 + preccnt % 8] =
                prec[(preccnt - 1) / 8 * 24 + j * 8 + (preccnt - 1) % 8];
        ++preccnt;
    }
    auto vecans = _mm256_set1_epi32(0);
    auto vecij = _mm256_set1_epi32(0);
    auto veck = _mm256_set1_epi32(0);
    for (int _ = 0; _ < 15000; ++_) {
        fill((int *)ff, (int *)ff + (1 << K) * 8, 0);
        for (int i = 0; i < 32; ++i) {
            mp[i] = 1 << (rnd() % K);
            if (mp[i] < (1 << 8)) {
                mplow[i] = mp[i];
                mphi[i] = 0;
            } else {
                mplow[i] = 0;
                mphi[i] = mp[i] >> 8;
            }
        }
        auto lo_le16 = _mm256_broadcastsi128_si256(_mm_load_si128((__m128i *)mplow));
        auto hi_le16 = _mm256_broadcastsi128_si256(_mm_load_si128((__m128i *)mphi));
        auto lo_ge16 = _mm256_broadcastsi128_si256(_mm_load_si128((__m128i *)(mplow + 16)));
        auto hi_ge16 = _mm256_broadcastsi128_si256(_mm_load_si128((__m128i *)(mphi + 16)));
        auto ge16 = _mm256_set1_epi8(-128);
        for (int i = 0; i < n; i += 32)  // 没写边界
        {
            auto ymm0 = _mm256_load_si256((__m256i *)(xx + i * 5));
            auto ymm1 = _mm256_load_si256((__m256i *)(xx + i * 5 + 32));
            auto ymm2 = _mm256_load_si256((__m256i *)(xx + i * 5 + 64));
            auto ymm3 = _mm256_load_si256((__m256i *)(xx + i * 5 + 96));
            auto ymm4 = _mm256_load_si256((__m256i *)(xx + i * 5 + 128));

#define PROC1(x)                                                                  \
    /* lo / hi -> mp[xx[i]]<256 / >=256    le16 / ge16 -> xx[i]<16 / >=16 */      \
    auto ymm##x##lo_le16 = _mm256_shuffle_epi8(lo_le16, ymm##x);                  \
    auto ymm##x##hi_le16 = _mm256_shuffle_epi8(hi_le16, ymm##x);                  \
    auto ymm##x##lo_ge16 = _mm256_shuffle_epi8(lo_ge16, ymm##x ^ ge16);           \
    auto ymm##x##hi_ge16 = _mm256_shuffle_epi8(hi_ge16, ymm##x ^ ge16);           \
    /* char[0:31] -> short[0:15]*2 */                                             \
    auto ymm##x##le16_0 = _mm256_unpacklo_epi8(ymm##x##lo_le16, ymm##x##hi_le16); \
    auto ymm##x##le16_1 = _mm256_unpackhi_epi8(ymm##x##lo_le16, ymm##x##hi_le16); \
    auto ymm##x##ge16_0 = _mm256_unpacklo_epi8(ymm##x##lo_ge16, ymm##x##hi_ge16); \
    auto ymm##x##ge16_1 = _mm256_unpackhi_epi8(ymm##x##lo_ge16, ymm##x##hi_ge16); \
    /* mp[xx[i]] for i=[0:7,16:23],[8:15,24:31] */                                \
    auto ymm##x##_0 = ymm##x##le16_0 | ymm##x##ge16_0;                            \
    auto ymm##x##_1 = ymm##x##le16_1 | ymm##x##ge16_1;

            PROC1(0)
            PROC1(1)
            PROC1(2)
            PROC1(3)
            PROC1(4)

            ymm0_0 = (ymm0_0 | ymm1_0) | (ymm2_0 | ymm3_0) | ymm4_0;
            ymm0_1 = (ymm0_1 | ymm1_1) | (ymm2_1 | ymm3_1) | ymm4_1;

            _mm256_store_si256(&ymm0_0, ymm0_0);
            _mm256_store_si256(&ymm0_1, ymm0_1);

            short *p0 = (short *)(&ymm0_0);
            short *p1 = (short *)(&ymm0_1);

#define UPD(t, r)                                                                                     \
    {                                                                                                 \
        auto ymm0 = _mm_load_si128((__m128i *)(ff[t]));                                               \
        auto ymm1 = _mm_load_si128((__m128i *)(f[r]));                                                \
        _mm_store_si128((__m128i *)(ff[t]), _mm_max_epi32(ymm0, ymm1));                               \
        long long msk = _mm_cvtsi128_si64(_mm_bsrli_si128(_mm_cmpgt_epi32(ymm0, ymm1), 2));           \
        unsigned long long *ptr = (unsigned long long *)(&(ff[t][4]));                                \
        *ptr = (*ptr & msk) | (((unsigned long long)(r) * ((1ull << 48) + (1ull << 16) + 1)) & ~msk); \
    }

#define PROC2(x) UPD(p0[x], i + x);

#define PROC3(x) UPD(p1[x], i + x + 8);

#define PROC4(x) UPD(p0[x], i + x + 8);

#define PROC5(x) UPD(p1[x], i + x + 16);

            PROC2(0)
            PROC2(1)
            PROC2(2)
            PROC2(3)
            PROC2(4)
            PROC2(5)
            PROC2(6)
            PROC2(7)

            PROC3(0)
            PROC3(1)
            PROC3(2)
            PROC3(3)
            PROC3(4)
            PROC3(5)
            PROC3(6)
            PROC3(7)

            PROC4(8)
            PROC4(9)
            PROC4(10)
            PROC4(11)
            PROC4(12)
            PROC4(13)
            PROC4(14)
            PROC4(15)

            PROC5(8)
            PROC5(9)
            PROC5(10)
            PROC5(11)
            PROC5(12)
            PROC5(13)
            PROC5(14)
            PROC5(15)
        }
        for (int i = 0; i < (1 << K); i++) {
            for (int j = 0; j < K; j++) {
                if (i >> j & 1 ^ 1) {
                    if (ff[i | 1 << j][2] < ff[i][2]) {
                        ff[i | 1 << j][2] = ff[i][2];
                        ff[i | 1 << j][5] = ff[i][5];
                    }
                }
            }
        }
        for (int i = 0; i < preccnt; i += 8) {
            auto ymm0 = _mm256_load_si256((__m256i *)(prec + i * 3));
            auto ymm1 = _mm256_load_si256((__m256i *)(prec + i * 3 + 8));
            auto ymm2 = _mm256_load_si256((__m256i *)(prec + i * 3 + 16));

            auto ymm0_gather = _mm256_i32gather_epi32(ff[0], ymm0, 4);
            auto ymm0_index = _mm256_i32gather_epi32(ff[0] + 4, ymm0, 4);
            auto ymm1_gather = _mm256_i32gather_epi32(ff[0] + 1, ymm1, 4);
            auto ymm1_index = _mm256_i32gather_epi32(ff[0] + 4, ymm1, 4);
            auto ymm2_gather = _mm256_i32gather_epi32(ff[0] + 2, ymm2, 4);
            auto ymm2_index = _mm256_i32gather_epi32(ff[0] + 5, ymm2, 4);

            auto sum = _mm256_add_epi32(ymm0_gather, _mm256_add_epi32(ymm1_gather, ymm2_gather));
            auto cmp = _mm256_cmpgt_epi32(sum, vecans);
            vecans = _mm256_max_epi32(vecans, sum);
            vecij = _mm256_blendv_epi8(vecij, _mm256_blend_epi16(ymm1_index, ymm0_index, 85), cmp);
            veck = _mm256_blendv_epi8(veck, ymm2_index, cmp);
        }
    }
    _mm256_store_si256(&vecans, vecans);
    _mm256_store_si256(&vecij, vecij);
    _mm256_store_si256(&veck, veck);
    int I, J, K;
    for (int i = 0; i < 8; ++i) {
        int t = ((int *)(&vecans))[i];
        if (ans < t) {
            ans = t;
            I = ((int *)(&vecij))[i];
            output[1] = J = ((unsigned)I) >> 16;
            output[0] = I = I & ((1 << 16) - 1);
            output[2] = K = ((unsigned *)(&veck))[i] >> 16;
        }
    }
    return ans;
    // assert(f[I][0] + f[J][1] + f[K][2] == ans);
}

extern "C" EXPORT int calc(int n, int ans, int *a, int *b, int *output) {
    // cout << n << endl;

    // // if (n <= 10000) 
    // auto st = chrono::steady_clock::now().time_since_epoch().count();
    // 
    // auto mid = chrono::steady_clock::now().time_since_epoch().count();
    // int res = calc2(n, ans, a, b, output);
    // auto ed = chrono::steady_clock::now().time_since_epoch().count();
    // cout << (mid - st) / 1e9 << " " << (ed - mid) / 1e9 << endl;
    // return res;
    return calc1(n, ans, a, b, output);
}