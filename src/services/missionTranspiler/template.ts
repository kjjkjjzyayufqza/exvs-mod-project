// Embedded at build time; authoring never reads a template from disk.
// Reference: user-selected OBHK A-30-1 mission; preserve function layout.
export const TEMPLATE_SOURCE_SHA256 = "0cb7eb7cc93f899f5e077995642dd5a117be40fee1e642956ad89ffae9955ac3";
export const MISSION_C_TEMPLATE = String.raw`int global0;
int global1;
int global2;
int global3;
int global4;
int global5;
int global6;
int global7;
int global8;
int global9;
int global10;
int global11;
int global12;
int global13;
int global14;
int global15;
int global16;
int global17;
int global18;
int global19;
int global20;
int global21;
int global22;
int global23;
int global24;

int func_0(int arg0)
{
    if (0x2af8 <= arg0 && arg0 < 0x32c8)
    {
        return 0;
    }
    return sys_0(0x331, arg0);
}

void func_1()
{
    
}

int func_2(int arg0, int arg1)
{
    if (arg0 == 0)
    {
        arg0 = arg1 * 0x3c;
    }
    else if (arg0 >= 0xffffffff && arg0-- == 0)
    {
        arg0 = 0xffffffff;
    }
    return arg0;
}

int func_3(int arg0, int arg1)
{
    if (arg0 == 0)
    {
        arg0 = arg1;
    }
    else if (arg0 >= 0xffffffff && arg0-- == 0)
    {
        arg0 = 0xffffffff;
    }
    return arg0;
}

int func_4(int arg0, int arg1, int arg2)
{
    arg1 = func_2(arg1, arg2);
    if (arg1 == 0xffffffff)
    {
        func_30(arg0);
        return arg1;
    }
    sys_0(0x800);
    return arg1;
}

int func_5(int arg0, int arg1, int arg2)
{
    if (func_31(arg0) == 0)
    {
        arg1 = func_3(arg1, arg2);
        if (arg1 <= 0)
        {
            return arg1;
        }
        func_30(arg0);
        sys_0(0x800);
        return arg1;
    }
    return arg1;
}

void func_6()
{
    int var0;
    int var1;
    int var2;
    int var3;
    var0 = sys_0(0x30d, sys_0(0x20a));
    if (var0 == 0xffffffff)
    {
        return;
    }
    var1 = 0x100;
    var2 = 0;
    while (var2 < var1)
    {
        if (sys_0(0x403, var2) == 0)
        {
            continue;
        }
        if (sys_0(0x402, var2) != var0)
        {
            var3 = sys_0(0x203, var2);
        }
        var2++;
    }
}

void func_7()
{
    int var0;
    int var1;
    int var2;
    int var3;
    int var4;
    int var5;
    int var6;
    var0 = sys_0(0x30d, sys_0(0x20a));
    if (var0 == 0xffffffff)
    {
        return;
    }
    var1 = 0x100;
    var2 = 0;
    while (var2 < var1)
    {
        if (sys_0(0x403, var2) == 0)
        {
            continue;
        }
        if (sys_0(0x402, var2) != var0)
        {
            var3 = sys_0(0x203, var2);
            var4 = 0;
            while (var4 < 0x2)
            {
                var5 = sys_0(0x333, var3, var4);
                if (var5)
                {
                    var6 = sys_0(0x213, var3, var5, var4);
                    sys_0(0x353, var3, var6, var4);
                }
                var4++;
            }
        }
        var2++;
    }
}

void func_8()
{
    int var0;
    int var1;
    int var2;
    int var3;
    int var4;
    var0 = sys_0(0x20c);
    var1 = 0;
    while (var1 < var0)
    {
        var2 = sys_0(0x20d, var1);
        if (var2 != 0xffffffff)
        {
            while (!sys_0(0x208, var2))
            {
                sys_0(0x800);
            }
            var3 = 0;
            while (var3 < 0x2)
            {
                var4 = sys_0(0x354, var2, var3);
                if (var4 != 0xffffffff)
                {
                    while (!sys_0(0x208, var4))
                    {
                        sys_0(0x800);
                    }
                }
                var3++;
            }
        }
        var1++;
    }
}

void func_9()
{
    func_7();
    func_8();
}

void func_10(int arg0)
{
    int var1;
    int var2;
    int var3;
    if (!sys_0(0x403, arg0))
    {
        return 0xffffffff;
    }
    var1 = sys_0(0x212, arg0);
    if (var1 != 0xffffffff)
    {
        sys_0(0x302, var1);
        var2 = 0;
        while (var2 < 0x2)
        {
            var3 = sys_0(0x354, var1, var2);
            if (var3 != 0xffffffff)
            {
                sys_0(0x302, var3);
            }
            var2++;
        }
    }
}

void func_11(int arg0)
{
    int var1;
    int var2;
    int var3;
    int var4;
    if (!sys_0(0x403, arg0))
    {
        return 0xffffffff;
    }
    var1 = global0;
    global0 = 0;
    var2 = sys_0(0x212, arg0);
    if (var2 != 0xffffffff)
    {
        while (!sys_0(0x303, var2))
        {
            sys_0(0x800);
            func_16();
        }
        var3 = 0;
        while (var3 < 0x2)
        {
            var4 = sys_0(0x354, var2, var3);
            if (var4 != 0xffffffff)
            {
                while (!sys_0(0x303, var4))
                {
                    sys_0(0x800);
                    func_16();
                }
                sys_0(0x335, var2, var4, 0, var3);
            }
            var3++;
        }
    }
    global0 = var1;
}

void func_12(int arg0)
{
    func_10(arg0);
    func_11(arg0);
    sys_0(0x336, arg0);
}

void main()
{
    global1 = 0x3e8;
    global2 = 0x3e8;
    global3 = 0;
    global4 = 0;
    global5 = 0;
    global6 = 0;
    global7 = 0;
    global8 = 0;
    global9 = 0;
    global0 = 0;
    global10 = 0;
    global11 = 0;
    global12 = 0;
    global13 = 0;
    global14 = 0;
    global15 = 0;
    func_33();
    func_14();
    sys_0(0x802, 0x9de);
    callFunc3(func_16);
}

void func_16()
{
    if (func_17())
    {
        callFunc3(func_18);
    }
    else
    {
        func_19();
        if (global0)
        {
            (*global0)();
        }
    }
}

void func_18()
{
    if (sys_0(0x34f))
    {
        func_19();
    }
}

void func_14()
{
    int var0;
    int var1;
    int var2;
    int var3;
    int var4;
    int var5;
    int var6;
    int var7;
    int var8;
    int var9;
    int var10;
    int var11;
    int var12;
    var0 = global1;
    var1 = global2;
    var2 = global3;
    var3 = global4;
    var4 = global5;
    var5 = global6;
    var6 = sys_0(0x410, 0);
    var7 = sys_0(0x410, 0x1);
    var8 = sys_0(0x410, 0x2);
    var9 = sys_0(0x410, 0x3);
    var10 = sys_0(0x410, 0x4);
    var11 = sys_0(0x410, 0x5);
    if (var6 != 0)
    {
        global1 = var6;
    }
    if (var7 != 0)
    {
        global2 = var7;
    }
    if (var8 != 0)
    {
        global3 = var8;
    }
    if (var9 != 0)
    {
        global4 = var9;
    }
    if (var10 != 0)
    {
        global5 = var10;
    }
    if (var11 != 0)
    {
        global6 = var11;
    }
    sys_0(0x407, 0, global1, var0);
    sys_0(0x407, 0x1, global2, var1);
    sys_0(0x407, 0x2, global3, var2);
    sys_0(0x407, 0x3, global4, var3);
    sys_0(0x407, 0x4, global5, var4);
    sys_0(0x407, 0x5, global6, var5);
    sys_0(0x415, 0, global14, 0x15f90);
    sys_0(0x415, 0x1, global15, 0x15f90);
    var12 = 0;
    while (var12 < 0x6)
    {
        if (sys_0(0x406, var12) > 0)
        {
            global7 |= 0x1 << var12;
        }
        var12++;
    }
}

void func_20(int arg0)
{
    int var1;
    int var2;
    var1 = func_0(arg0);
    var2 = sys_0(0x320, var1);
    while (!sys_0(0x208, var2))
    {
        sys_0(0x800);
    }
    sys_0(0x313, var2, arg0);
    sys_0(0x803);
}

void func_15()
{
    int var0;
    while (0x1)
    {
        var0 = sys_0(0x32d);
        if (var0)
        {
            if (0x1 == var0)
            {
                sys_0(0x802, 0x97d, sys_0(0x32e));
            }
            sys_0(0x330);
        }
        else
        {
            sys_0(0x800);
        }
    }
}

void func_17()
{
    int var0;
    int var1;
    int var2;
    int var3;
    int var4;
    int var5;
    int var6;
    int var7;
    int var8;
    int var9;
    int var10;
    int var11;
    int var12;
    int var13;
    int var14;
    var0 = sys_0(0x30d, sys_0(0x20a));
    var1 = var0;
    var2 = 0x1;
    if (var0 == 0xffffffff)
    {
        return 0;
    }
    var3 = 0;
    var4 = sys_0(0x306);
    var5 = sys_0(0x350);
    var6 = 0;
    while (var6 < var4)
    {
        var7 = sys_0(0x307, var6);
        if (sys_0(0x340, var7) == 0x1)
        {
            continue;
        }
        var8 = sys_0(0x30d, var7);
        var9 = sys_0(0x30c, var7);
        var10 = sys_0(0x30e, var7);
        var11 = sys_0(0x406, var8);
        if (var11 <= var9 && sys_0(0x338, var7))
        {
            sys_0(0x339, var7);
            continue;
        }
        else
        {
            var12 = !sys_0(0x34e, var8);
            var2 = !sys_0(0x34e, var8);
            if (global16 & 0xa)
            {
                if (var0 != var8)
                {
                    var12 = 0;
                }
            }
            if (global17 & 0x2)
            {
                if (var0 == var8)
                {
                    var12 = 0;
                }
            }
            if (var5 && (var0 == var8 && !var10))
            {
                var12 = 0;
            }
            if (global8 == 0x1)
            {
                var12 = 0;
            }
            if (var12)
            {
                var11 -= var9;
            }
            sys_0(0x342, var7, 0);
            if (var11 <= 0)
            {
                var11 = 0;
            }
        }
        if (sys_0(0x40a, var7))
        {
            if (var8 == var0)
            {
                global11++;
            }
            else
            {
                global13++;
            }
        }
        var13 = 0x3e8;
        if (var9 > var11)
        {
            var13 = var11 * 0x3e8 / var9;
        }
        sys_0(0x341, var7, var13);
        sys_0(0x407, var8, var11);
        if (global17 & 0x10 || global17 & 0x8)
        {
            var14 = var8;
            if (var8 == 0)
            {
                var14 = 0x1;
            }
            if (var8 == 0x1)
            {
                var14 = 0;
            }
            sys_0(0x415, var14, var9, var7);
        }
        if (func_21(var7, var0))
        {
            var3 = 0x1;
        }
        else if (func_22(var7, var0))
        {
            var3 = 0x2;
        }
        else if (func_23(var7))
        {
            var3 = 0x1;
        }
        var6++;
    }
    if (func_24())
    {
        var3 = 0x3;
    }
    if (var3 == 0)
    {
        var3 = func_25(var0);
    }
    if (var3 != 0)
    {
        if (var3 == 0x1)
        {
            
        }
        else if (var3 == 0x2)
        {
            var1 ^= 0x1;
        }
        else if (var3 == 0x3)
        {
            
        }
        if (var2)
        {
            sys_0(0x31c, var3, func_26(), var1);
            return 0x1;
        }
        else
        {
            return 0;
        }
    }
    else
    {
        return 0;
    }
}

int func_24()
{
    if (global16 & 0x1 || global17 & 0x1)
    {
        if (func_27() == 0)
        {
            return 0x1;
        }
    }
    return 0;
}

int func_21(int arg0, int arg1)
{
    int var2;
    int var3;
    int var4;
    int var5;
    int var6;
    if (global16 & 0x1)
    {
        var2 = func_27();
        if (var2 != global7)
        {
            if (var2 & 0x1 << arg1)
            {
                if (var2 == 0x1 << arg1)
                {
                    sys_0(0x33b, arg0);
                    sys_0(0x342, arg0, 0x1);
                    return 0x1;
                }
                else
                {
                    var3 = var2 & ~(0x1 << arg1);
                    var4 = sys_0(0x406, arg1);
                    var5 = sys_0(0x406, var3);
                    if (var5 <= var4)
                    {
                        sys_0(0x33b, arg0);
                        sys_0(0x342, arg0, 0x1);
                        return 0x1;
                    }
                }
            }
        }
    }
    if (global16 & 0x2)
    {
        if (global13 >= global12)
        {
            var6 = !sys_0(0x34e, arg1);
            if (var6)
            {
                sys_0(0x33b, arg0);
                sys_0(0x342, arg0, 0x1);
                return 0x1;
            }
            return 0;
        }
    }
    return 0;
}

int func_22(int arg0, int arg1)
{
    int var2;
    int var3;
    int var4;
    int var5;
    if (global17 & 0x1)
    {
        var2 = func_27();
        if (var2 != global7)
        {
            if (!(var2 & 0x1 << arg1))
            {
                sys_0(0x33b, arg0);
                sys_0(0x342, arg0, 0x1);
                return 0x1;
            }
            else
            {
                var3 = var2 & ~(0x1 << arg1);
                var4 = sys_0(0x406, arg1);
                var5 = sys_0(0x406, var3);
                if (var4 < var5)
                {
                    sys_0(0x33b, arg0);
                    sys_0(0x342, arg0, 0x1);
                    return 0x1;
                }
            }
        }
    }
    if (global17 & 0x2)
    {
        if (global11 >= global10)
        {
            sys_0(0x33b, arg0);
            sys_0(0x342, arg0, 0x1);
            return 0x1;
        }
    }
    return 0;
}

void func_25(int arg0)
{
    int var1;
    int var2;
    int var3;
    if (sys_0(0x411))
    {
        if (global16 & 0x4)
        {
            return 0x1;
        }
        else if (global17 & 0x4)
        {
            return 0x3;
        }
        else if (global17 & 0x10 || global17 & 0x8)
        {
            var1 = 0;
            if (arg0 == 0)
            {
                var1 = 0x1;
            }
            if (arg0 == 0x1)
            {
                var1 = 0;
            }
            var2 = sys_0(0x414, arg0);
            var3 = sys_0(0x414, var1);
            if (var3 < var2)
            {
                return 0x1;
            }
            if (var3 > var2)
            {
                return 0x2;
            }
            if (var3 == var2)
            {
                return 0x3;
            }
            return 0;
        }
    }
    else
    {
        return 0;
    }
}

int func_23(int arg0)
{
    if (global16 & 0x8)
    {
        if (global13 > 0 && global13 >= sys_0(0x349))
        {
            sys_0(0x33b, arg0);
            sys_0(0x342, arg0, 0x1);
            return 0x1;
        }
    }
    return 0;
}

void func_19()
{
    int var0;
    int var1;
    int var2;
    int var3;
    int var4;
    int var5;
    int var6;
    int var7;
    int var8;
    int var9;
    int var10;
    int var11;
    var0 = sys_0(0x308);
    var1 = 0x1e;
    sys_0(0x604, 0x3c);
    var2 = 0;
    var3 = 0;
    while (var3 < var0)
    {
        var4 = sys_0(0x309, var3);
        if (sys_0(0x325, var4) == 0)
        {
            sys_0(0x601, 0x3c, var2, var4);
            var2++;
            continue;
        }
        var5 = sys_0(0x30b, var4);
        if (var5 == var1)
        {
            var6 = sys_0(0x30d, sys_0(0x20a));
            var7 = sys_0(0x30c, var4);
            var8 = sys_0(0x30d, var4);
            var9 = sys_0(0x30e, var4);
            var10 = sys_0(0x350);
            if (var10 && (var8 == var6 && !var9))
            {
                global18 = sys_0(0x351);
                if (global18 > 0)
                {
                    global18 = global18 - 0x1;
                    sys_0(0x352, global18);
                }
                else
                {
                    continue;
                }
            }
            var11 = sys_0(0x406, var8);
            sys_0(0x30a, var4);
        }
        var3++;
    }
    var3 = 0;
    while (var3 < var2)
    {
        if (sys_0(0x340, sys_0(0x603, 0x3c, var3)) == 0x1)
        {
            continue;
        }
        var6 = sys_0(0x30d, sys_0(0x20a));
        var8 = sys_0(0x30d, sys_0(0x603, 0x3c, var3));
        var10 = sys_0(0x350);
        if (var10 && var6 != var8)
        {
            sys_0(0x214, sys_0(0x603, 0x3c, var3));
        }
        else
        {
            sys_0(0x207, sys_0(0x603, 0x3c, var3));
        }
        var3++;
    }
}

int func_27()
{
    int var0;
    int var1;
    var0 = 0;
    var1 = 0;
    while (var1 < 0x6)
    {
        if (global7 & 0x1 << var1 && sys_0(0x406, var1) > 0)
        {
            var0 |= 0x1 << var1;
        }
        var1++;
    }
    return var0;
}

void func_26()
{
    if (sys_0(0x411))
    {
        return 0x1;
    }
    else
    {
        return 0;
    }
}

int func_28(int arg0)
{
    int var1;
    if (sys_0(0x403, arg0))
    {
        var1 = sys_0(0x203, arg0);
        return var1;
    }
    return 0xffffffff;
}

void func_29()
{
    int var0;
    int var1;
    int var2;
    var0 = sys_0(0x20c);
    var1 = 0;
    while (var1 < var0)
    {
        var2 = sys_0(0x20d, var1);
        if (var2 != 0xffffffff)
        {
            while (!sys_0(0x208, var2))
            {
                sys_0(0x800);
            }
        }
        var1++;
    }
    var1 = 0;
    while (var1 < var0)
    {
        var2 = sys_0(0x20d, var1);
        if (var2 != 0xffffffff)
        {
            sys_0(0x302, var2);
        }
        var1++;
    }
    var1 = 0;
    while (var1 < var0)
    {
        var2 = sys_0(0x20d, var1);
        if (var2 != 0xffffffff)
        {
            while (!sys_0(0x303, var2))
            {
                sys_0(0x800);
            }
        }
        var1++;
    }
}

void func_30(int arg0)
{
    int var1;
    int var2;
    int var3;
    int var4;
    int var5;
    var1 = 0xffffffff;
    if (sys_0(0x403, arg0))
    {
        var2 = sys_0(0x20c);
        var3 = 0;
        while (var3 < var2)
        {
            var4 = sys_0(0x20d, var3);
            var5 = sys_0(0x20b, var4);
            if (arg0 == var5)
            {
                if (sys_0(0x20e, var4))
                {
                    
                }
                else
                {
                    var1 = var4;
                    break;
                }
            }
            var3++;
        }
        if (var1 != 0xffffffff)
        {
            sys_0(0x304, var1);
            return var1;
        }
        else
        {
            var4 = func_28(arg0);
            func_29();
            if (var4 != 0xffffffff)
            {
                sys_0(0x304, var4);
            }
            return var4;
        }
    }
}

int func_31(int arg0)
{
    int var1;
    int var2;
    int var3;
    var1 = sys_0(0x212, arg0);
    if (var1 == 0xffffffff)
    {
        return 0;
    }
    var2 = sys_0(0x308);
    var3 = 0;
    while (var3 < var2)
    {
        var1 = sys_0(0x309, var3);
        if (sys_0(0x20b, var1) == arg0)
        {
            return 0;
        }
        var3++;
    }
    return sys_0(0x356, arg0);
}

void func_32()
{
    sys_0(0x40e, 0xfe67f4f9);
    global1 = 0x1770;
    global2 = 0x1d4c;
    global3 = 0;
    global16 = 0x1;
    global17 = 0x5;
    global12 = 0;
    global10 = 0x1;
    global19 = 0xba15df91;
    sys_0(0x400, 0, 0, 0xf4629, 0, 0, 0, 0, 0, 0, 0x1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x5, 0x5, 0x64, 0x64, 0x64, 0, 0, 0x4, 0, 0, 0, 0, 0, 0, 0x96, 0xc8, 0xffffffd8, 0, 0, 0x1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    sys_0(0x400, 0x1, 0, 0x17d7c29, 0, 0x1, 0x1, 0, 0x1, 0, 0x1, 0, 0, 0x63, 0, 0, 0, 0x4, 0x9, 0, 0, 0x5, 0x5, 0x64, 0x64, 0x64, 0, 0, 0x4, 0, 0, 0, 0, 0, 0, 0x78, 0xc8, 0xffffffd8, 0, 0, 0x1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    sys_0(0x400, 0x2, 0, 0xf6181, 0x1, 0, 0, 0, 0x1, 0, 0x1, 0, 0, 0x62, 0x3, 0x1, 0, 0, 0, 0, 0, 0x1, 0, 0x46, 0x64, 0x64, 0, 0, 0, 0xb4, 0, 0, 0, 0, 0, 0x8c, 0xc8, 0x15e, 0, 0xb4, 0x1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    sys_0(0x400, 0x3, 0, 0xf4df9, 0x1, 0, 0, 0, 0x1, 0, 0x1, 0, 0, 0x61, 0x3, 0x1, 0, 0, 0, 0, 0, 0x1, 0, 0x46, 0x64, 0x64, 0, 0, 0, 0xb4, 0, 0, 0, 0, 0, 0x5a, 0xd7, 0x18b, 0, 0xb4, 0x1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    sys_0(0x400, 0x4, 0, 0xf55c9, 0x1, 0, 0, 0, 0x1, 0, 0x1, 0, 0, 0x60, 0, 0x1, 0, 0x1, 0x1, 0, 0, 0x1, 0, 0x46, 0x64, 0x64, 0, 0, 0, 0xb4, 0, 0, 0, 0, 0, 0x19, 0x78, 0x258, 0x2, 0xb4, 0x3c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    sys_0(0x400, 0x5, 0, 0xf4629, 0x1, 0, 0, 0, 0x1, 0, 0x1, 0, 0, 0x5f, 0, 0x1, 0, 0x1, 0x1, 0, 0, 0x1, 0, 0x46, 0x64, 0x64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xffffffd3, 0x64, 0x258, 0x2, 0xb4, 0x3c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    sys_0(0x400, 0x6, 0, 0x29c89c09, 0x1, 0, 0, 0, 0, 0, 0x1, 0, 0, 0x63, 0, 0x1, 0, 0, 0, 0, 0, 0x3, 0, 0x46, 0x64, 0x64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xffffff6a, 0x50, 0x244, 0x2, 0xb4, 0x3c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    sys_0(0x400, 0x7, 0, 0x29c87111, 0x1, 0, 0, 0, 0, 0, 0x1, 0, 0, 0x63, 0, 0x1, 0, 0, 0, 0, 0, 0x3, 0, 0x46, 0x64, 0x64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x96, 0x50, 0x244, 0x2, 0xb4, 0x3c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}

void func_33()
{
    global20 = 0;
    global0 = func_34;
    func_32();
    sys_0(0x40d);
    global21 = 0;
    global22 = 0;
    global23 = 0;
    global24 = 0;
}

void func_34()
{
    while (sys_0(0x454) != 0x1)
    {
        sys_0(0x800);
    }
    func_9();
    func_12(0x2);
    func_12(0x3);
    sys_0(0x453, 0x1);
    global0 = func_35;
    sys_0(0x33f, global19);
}

void func_35()
{
    if (global20 == 0)
    {
        if (sys_0(0x40f) <= 0x1)
        {
            if ((global24 = func_2(global24, 0x1)) == 0xffffffff)
            {
                global24 = 0;
                global20 = 0x1;
                sys_0(0x355, 0x4, 0x2655484b);
                func_12(0x4);
            }
        }
    }
    else if (global20 == 0x1)
    {
        if (sys_0(0x40f) <= 0x1)
        {
            if ((global24 = func_2(global24, 0x1)) == 0xffffffff)
            {
                global24 = 0;
                global20 = 0x2;
                sys_0(0x355, 0x5, 0x2655484b);
                func_12(0x5);
            }
        }
    }
    else if (global20 == 0x2)
    {
        if (sys_0(0x40f) <= 0x1)
        {
            if ((global24 = func_2(global24, 0x5)) == 0xffffffff)
            {
                global24 = 0;
                global20 = 0x3;
                func_12(0x6);
            }
        }
    }
    else if (global20 == 0x3)
    {
        if (sys_0(0x40f) <= 0x1)
        {
            if ((global24 = func_2(global24, 0x5)) == 0xffffffff)
            {
                global24 = 0;
                global20 = 0x4;
                func_12(0x7);
            }
        }
    }
    else if (global20 == 0x4)
    {
        
    }
}

`;
