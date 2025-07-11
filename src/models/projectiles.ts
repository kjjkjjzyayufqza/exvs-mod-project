import { CommandsData } from './commandsData'

export class ProjectileOB {
  public Magic: number //0x0
  public FileSize: number //0x8
  public ProjectileCount: number //0x10
  public CommandsCount: number //0x14
  public ProjectileInfoEachSize: number //0x18
  public CommandsData: CommandsData
  public ProjectileInfos: ProjectileInfoOB[]

  constructor (public BufferData: Buffer) {
    this.Magic = BufferData.readInt32LE(0x0)
    this.FileSize = BufferData.readInt32LE(0x8)
    this.ProjectileCount = BufferData.readInt32LE(0x10)
    this.CommandsCount = BufferData.readInt32LE(0x14)
    this.ProjectileInfoEachSize = BufferData.readInt32LE(0x18)
    this.CommandsData = new CommandsData(BufferData, 0x20)
    this.ProjectileInfos = []

    if (this.ProjectileInfoEachSize != 0x140) {
      throw new Error('ProjectileInfoEachSize is not 0x140, Not supported')
    }

    // Initialize ProjectileInfos array
    const baseOffset = 0x20 + this.CommandsData.CommandsId.length * 0x4 + this.CommandsData.CommandsData.length * 0xc
    for (let i = 0; i < this.ProjectileCount; i++) {
      const offset = baseOffset + i * this.ProjectileInfoEachSize
      this.ProjectileInfos.push(new ProjectileInfoOB(BufferData, offset, i))
    }
  }
}

export class ProjectileInfoOB {
  public ProjectileId: number
  public OffsetFB: number //0x0
  public OffsetLR: number //0x4
  public Unk1: number //0x8
  public Type: number //0xc
  public RandomDiffusion1: number //0x10 基于时间戳来计算随机化
  public RandomDiffusion2: number //0x14
  public Unk2: number //0x18
  public Unk3: number //0x1c
  public FunnelInitFaceUpOrDown: number //0x20
  public Unk5: number //0x24
  public FunnelMoveSpeed: number //0x28
  public ProjectileLifespan: number //0x2c
  public Unk7: number //0x30
  public Unk8: number //0x34
  public Unk9: number //0x38
  public Unk10: number //0x3c
  public Unk11: number //0x40
  public FunnelOnEnemyLeftOrRight: number //0x44
  public FunnelWaitTimeToShoot: number //0x48
  public Unk13: number //0x4c
  public SubProjectileId: number //0x50
  public Unk14: number //0x54
  public Unk15: number //0x58
  public FunnelEndTime: number //0x5c
  public Unk16: number //0x60
  public FunnelOnEnemyUpOrDown: number //0x64
  public AudioId: number //0x68
  public Unk19: number //0x6c
  public Unk20: number //0x70
  public Unk21: number //0x74
  public Unk22: number //0x78
  public FunnelInitFaceSpeed: number //0x7c
  public Unk24: number //0x80
  public Unk25: number //0x84
  public Unk26: number //0x88
  public AleoId: number //0x8c
  public Ammo: number //0x90
  public Unk29: number //0x94
  public Unk30: number //0x98
  public Unk31: number //0x9c
  public IsPenetrate: number //0xa0
  public Unk33: number //0xa4
  public Unk34: number //0xa8
  public HitId: number //0xac
  public Unk36: number //0xb0
  public Unk37: number //0xb4
  public Unk38: number //0xb8
  public ProjectileInitSpeed: number //0xbc
  public TrackLeftRight: number //0xc0
  public TrackUpDown: number //0xc4
  public Unk41: number //0xc8
  public Unk42: number //0xcc
  public FunnelDistanceOnEnemy: number //0xd0
  public Unk44: number //0xd4
  public FunnelInitWaitTime: number //0xd8
  public Unk46: number //0xdc
  public Unk47: number //0xe0
  public FunnelInitHeight: number //0xe4
  public Unk49: number //0xe8
  public Unk50: number //0xec
  public Unk51: number //0xf0
  public Unk52: number //0xf4
  public Unk53: number //0xf8
  public Unk54: number //0xfc
  public FunnelReturnTime: number //0x100
  public Unk56: number //0x104
  public FunnelModelId: number //0x108
  public Unk58: number //0x10c
  public Unk59: number //0x110
  public Unk60: number //0x114
  public ShootFromModelId: number //0x118
  public Unk62: number //0x11c
  public Unk63: number //0x120
  public Unk64: number //0x124
  public Unk65: number //0x128
  public FunnelInitFrontOrBack: number //0x12c
  public Unk67: number //0x130
  public Unk68: number //0x134
  public Unk69: number //0x138
  public Unk70: number //0x13c
  public ProjectileKeepSpeed: number //0x140

  constructor (public BufferData: Buffer, public offset: number, projectileId: number) {
    this.ProjectileId = projectileId
    this.OffsetFB = BufferData.readFloatLE(offset + 0x0)
    this.OffsetLR = BufferData.readFloatLE(offset + 0x4)
    this.Unk1 = BufferData.readInt32LE(offset + 0x8)
    this.Type = BufferData.readInt32LE(offset + 0xc)
    this.RandomDiffusion1 = BufferData.readFloatLE(offset + 0x10)
    this.RandomDiffusion2 = BufferData.readFloatLE(offset + 0x14)
    this.Unk2 = BufferData.readInt32LE(offset + 0x18)
    this.Unk3 = BufferData.readInt32LE(offset + 0x1c)
    this.FunnelInitFaceUpOrDown = BufferData.readFloatLE(offset + 0x20)
    this.Unk5 = BufferData.readInt32LE(offset + 0x24)
    this.FunnelMoveSpeed = BufferData.readFloatLE(offset + 0x28)
    this.ProjectileLifespan = BufferData.readInt32LE(offset + 0x2c)
    this.Unk7 = BufferData.readInt32LE(offset + 0x30)
    this.Unk8 = BufferData.readInt32LE(offset + 0x34)
    this.Unk9 = BufferData.readInt32LE(offset + 0x38)
    this.Unk10 = BufferData.readInt32LE(offset + 0x3c)
    this.Unk11 = BufferData.readInt32LE(offset + 0x40)
    this.FunnelOnEnemyLeftOrRight = BufferData.readFloatLE(offset + 0x44)
    this.FunnelWaitTimeToShoot = BufferData.readFloatLE(offset + 0x48)
    this.Unk13 = BufferData.readInt32LE(offset + 0x4c)
    this.SubProjectileId = BufferData.readInt32LE(offset + 0x50)
    this.Unk14 = BufferData.readInt32LE(offset + 0x54)
    this.Unk15 = BufferData.readInt32LE(offset + 0x58)
    this.FunnelEndTime = BufferData.readFloatLE(offset + 0x5c)
    this.Unk16 = BufferData.readInt32LE(offset + 0x60)
    this.FunnelOnEnemyUpOrDown = BufferData.readFloatLE(offset + 0x64)
    this.AudioId = BufferData.readInt32LE(offset + 0x68)
    this.Unk19 = BufferData.readInt32LE(offset + 0x6c)
    this.Unk20 = BufferData.readInt32LE(offset + 0x70)
    this.Unk21 = BufferData.readInt32LE(offset + 0x74)
    this.Unk22 = BufferData.readInt32LE(offset + 0x78)
    this.FunnelInitFaceSpeed = BufferData.readFloatLE(offset + 0x7c)
    this.Unk24 = BufferData.readInt32LE(offset + 0x80)
    this.Unk25 = BufferData.readInt32LE(offset + 0x84)
    this.Unk26 = BufferData.readInt32LE(offset + 0x88)
    this.AleoId = BufferData.readInt32LE(offset + 0x8c)
    this.Ammo = BufferData.readInt32LE(offset + 0x90)
    this.Unk29 = BufferData.readInt32LE(offset + 0x94)
    this.Unk30 = BufferData.readInt32LE(offset + 0x98)
    this.Unk31 = BufferData.readInt32LE(offset + 0x9c)
    this.IsPenetrate = BufferData.readInt32LE(offset + 0xa0)
    this.Unk33 = BufferData.readInt32LE(offset + 0xa4)
    this.Unk34 = BufferData.readInt32LE(offset + 0xa8)
    this.HitId = BufferData.readInt32LE(offset + 0xac)
    this.Unk36 = BufferData.readInt32LE(offset + 0xb0)
    this.Unk37 = BufferData.readInt32LE(offset + 0xb4)
    this.Unk38 = BufferData.readInt32LE(offset + 0xb8)
    this.ProjectileInitSpeed = BufferData.readFloatLE(offset + 0xbc)
    this.TrackLeftRight = BufferData.readFloatLE(offset + 0xc0)
    this.TrackUpDown = BufferData.readFloatLE(offset + 0xc4)
    this.Unk41 = BufferData.readInt32LE(offset + 0xc8)
    this.Unk42 = BufferData.readInt32LE(offset + 0xcc)
    this.FunnelDistanceOnEnemy = BufferData.readFloatLE(offset + 0xd0)
    this.Unk44 = BufferData.readInt32LE(offset + 0xd4)
    this.FunnelInitWaitTime = BufferData.readFloatLE(offset + 0xd8)
    this.Unk46 = BufferData.readInt32LE(offset + 0xdc)
    this.Unk47 = BufferData.readInt32LE(offset + 0xe0)
    this.FunnelInitHeight = BufferData.readFloatLE(offset + 0xe4)
    this.Unk49 = BufferData.readInt32LE(offset + 0xe8)
    this.Unk50 = BufferData.readInt32LE(offset + 0xec)
    this.Unk51 = BufferData.readInt32LE(offset + 0xf0)
    this.Unk52 = BufferData.readInt32LE(offset + 0xf4)
    this.Unk53 = BufferData.readInt32LE(offset + 0xf8)
    this.Unk54 = BufferData.readInt32LE(offset + 0xfc)
    this.FunnelReturnTime = BufferData.readFloatLE(offset + 0x100)
    this.Unk56 = BufferData.readInt32LE(offset + 0x104)
    this.FunnelModelId = BufferData.readInt32LE(offset + 0x108)
    this.Unk58 = BufferData.readInt32LE(offset + 0x10c)
    this.Unk59 = BufferData.readInt32LE(offset + 0x110)
    this.Unk60 = BufferData.readInt32LE(offset + 0x114)
    this.ShootFromModelId = BufferData.readInt32LE(offset + 0x118)
    this.Unk62 = BufferData.readInt32LE(offset + 0x11c)
    this.Unk63 = BufferData.readInt32LE(offset + 0x120)
    this.Unk64 = BufferData.readInt32LE(offset + 0x124)
    this.Unk65 = BufferData.readInt32LE(offset + 0x128)
    this.FunnelInitFrontOrBack = BufferData.readFloatLE(offset + 0x12c)
    this.Unk67 = BufferData.readInt32LE(offset + 0x130)
    this.Unk68 = BufferData.readInt32LE(offset + 0x134)
    this.Unk69 = BufferData.readInt32LE(offset + 0x138)
    this.Unk70 = BufferData.readInt32LE(offset + 0x13c)
    this.ProjectileKeepSpeed = BufferData.readFloatLE(offset + 0x140)
  }
}
