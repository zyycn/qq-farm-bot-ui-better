import type { OnModuleInit } from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import * as protobuf from 'protobufjs'
import { ASSETS_DIR, CORE_ROOT, DIST_ROOT } from '../config/paths'

@Injectable()
export class ProtoService implements OnModuleInit {
  private readonly logger = new Logger(ProtoService.name)
  private root: protobuf.Root | null = null
  private _types: Record<string, protobuf.Type> = {}

  get types(): Record<string, protobuf.Type> {
    return this._types
  }

  async onModuleInit() {
    await this.loadProto()
  }

  private resolveProtoDir(): string {
    const candidates = [
      path.join(ASSETS_DIR, 'proto'),
      path.join(DIST_ROOT, 'assets', 'proto'),
      path.join(CORE_ROOT, 'src', 'assets', 'proto')
    ]
    return candidates.find(p => fs.existsSync(p)) || candidates[0]
  }

  async loadProto() {
    this.logger.log('正在加载 Protobuf 定义...')
    const protoDir = this.resolveProtoDir()
    this.root = new protobuf.Root()

    const protoFiles = [
      'game.proto',
      'userpb.proto',
      'plantpb.proto',
      'corepb.proto',
      'shoppb.proto',
      'friendpb.proto',
      'visitpb.proto',
      'notifypb.proto',
      'taskpb.proto',
      'itempb.proto',
      'emailpb.proto',
      'mallpb.proto',
      'redpacketpb.proto',
      'qqvippb.proto',
      'sharepb.proto',
      'illustratedpb.proto'
    ].map(f => path.join(protoDir, f))

    await this.root.load(protoFiles, { keepCase: true })

    const t = this._types
    const lookup = (name: string) => this.root!.lookupType(name)

    // 网关
    t.GateMessage = lookup('gatepb.Message')
    t.GateMeta = lookup('gatepb.Meta')
    t.EventMessage = lookup('gatepb.EventMessage')

    // 用户
    t.LoginRequest = lookup('gamepb.userpb.LoginRequest')
    t.LoginReply = lookup('gamepb.userpb.LoginReply')
    t.HeartbeatRequest = lookup('gamepb.userpb.HeartbeatRequest')
    t.HeartbeatReply = lookup('gamepb.userpb.HeartbeatReply')
    t.ReportArkClickRequest = lookup('gamepb.userpb.ReportArkClickRequest')
    t.ReportArkClickReply = lookup('gamepb.userpb.ReportArkClickReply')

    // 农场
    t.AllLandsRequest = lookup('gamepb.plantpb.AllLandsRequest')
    t.AllLandsReply = lookup('gamepb.plantpb.AllLandsReply')
    t.HarvestRequest = lookup('gamepb.plantpb.HarvestRequest')
    t.HarvestReply = lookup('gamepb.plantpb.HarvestReply')
    t.WaterLandRequest = lookup('gamepb.plantpb.WaterLandRequest')
    t.WaterLandReply = lookup('gamepb.plantpb.WaterLandReply')
    t.WeedOutRequest = lookup('gamepb.plantpb.WeedOutRequest')
    t.WeedOutReply = lookup('gamepb.plantpb.WeedOutReply')
    t.InsecticideRequest = lookup('gamepb.plantpb.InsecticideRequest')
    t.InsecticideReply = lookup('gamepb.plantpb.InsecticideReply')
    t.RemovePlantRequest = lookup('gamepb.plantpb.RemovePlantRequest')
    t.RemovePlantReply = lookup('gamepb.plantpb.RemovePlantReply')
    t.PutInsectsRequest = lookup('gamepb.plantpb.PutInsectsRequest')
    t.PutInsectsReply = lookup('gamepb.plantpb.PutInsectsReply')
    t.PutWeedsRequest = lookup('gamepb.plantpb.PutWeedsRequest')
    t.PutWeedsReply = lookup('gamepb.plantpb.PutWeedsReply')
    t.UpgradeLandRequest = lookup('gamepb.plantpb.UpgradeLandRequest')
    t.UpgradeLandReply = lookup('gamepb.plantpb.UpgradeLandReply')
    t.UnlockLandRequest = lookup('gamepb.plantpb.UnlockLandRequest')
    t.UnlockLandReply = lookup('gamepb.plantpb.UnlockLandReply')
    t.CheckCanOperateRequest = lookup('gamepb.plantpb.CheckCanOperateRequest')
    t.CheckCanOperateReply = lookup('gamepb.plantpb.CheckCanOperateReply')
    t.FertilizeRequest = lookup('gamepb.plantpb.FertilizeRequest')
    t.FertilizeReply = lookup('gamepb.plantpb.FertilizeReply')
    t.PlantRequest = lookup('gamepb.plantpb.PlantRequest')
    t.PlantReply = lookup('gamepb.plantpb.PlantReply')

    // 背包
    t.BagRequest = lookup('gamepb.itempb.BagRequest')
    t.BagReply = lookup('gamepb.itempb.BagReply')
    t.SellRequest = lookup('gamepb.itempb.SellRequest')
    t.SellReply = lookup('gamepb.itempb.SellReply')
    t.UseRequest = lookup('gamepb.itempb.UseRequest')
    t.UseReply = lookup('gamepb.itempb.UseReply')
    t.BatchUseRequest = lookup('gamepb.itempb.BatchUseRequest')
    t.BatchUseReply = lookup('gamepb.itempb.BatchUseReply')

    // 商店
    t.ShopProfilesRequest = lookup('gamepb.shoppb.ShopProfilesRequest')
    t.ShopProfilesReply = lookup('gamepb.shoppb.ShopProfilesReply')
    t.ShopInfoRequest = lookup('gamepb.shoppb.ShopInfoRequest')
    t.ShopInfoReply = lookup('gamepb.shoppb.ShopInfoReply')
    t.BuyGoodsRequest = lookup('gamepb.shoppb.BuyGoodsRequest')
    t.BuyGoodsReply = lookup('gamepb.shoppb.BuyGoodsReply')
    t.GetMonthCardInfosRequest = lookup('gamepb.mallpb.GetMonthCardInfosRequest')
    t.GetMonthCardInfosReply = lookup('gamepb.mallpb.GetMonthCardInfosReply')
    t.ClaimMonthCardRewardRequest = lookup('gamepb.mallpb.ClaimMonthCardRewardRequest')
    t.ClaimMonthCardRewardReply = lookup('gamepb.mallpb.ClaimMonthCardRewardReply')
    t.GetTodayClaimStatusRequest = lookup('gamepb.redpacketpb.GetTodayClaimStatusRequest')
    t.GetTodayClaimStatusReply = lookup('gamepb.redpacketpb.GetTodayClaimStatusReply')
    t.ClaimRedPacketRequest = lookup('gamepb.redpacketpb.ClaimRedPacketRequest')
    t.ClaimRedPacketReply = lookup('gamepb.redpacketpb.ClaimRedPacketReply')
    t.GetMallListBySlotTypeRequest = lookup('gamepb.mallpb.GetMallListBySlotTypeRequest')
    t.GetMallListBySlotTypeResponse = lookup('gamepb.mallpb.GetMallListBySlotTypeResponse')
    t.MallGoods = lookup('gamepb.mallpb.MallGoods')
    t.PurchaseRequest = lookup('gamepb.mallpb.PurchaseRequest')
    t.PurchaseResponse = lookup('gamepb.mallpb.PurchaseResponse')
    t.GetDailyGiftStatusRequest = lookup('gamepb.qqvippb.GetDailyGiftStatusRequest')
    t.GetDailyGiftStatusReply = lookup('gamepb.qqvippb.GetDailyGiftStatusReply')
    t.ClaimDailyGiftRequest = lookup('gamepb.qqvippb.ClaimDailyGiftRequest')
    t.ClaimDailyGiftReply = lookup('gamepb.qqvippb.ClaimDailyGiftReply')
    t.CheckCanShareRequest = lookup('gamepb.sharepb.CheckCanShareRequest')
    t.CheckCanShareReply = lookup('gamepb.sharepb.CheckCanShareReply')
    t.ReportShareRequest = lookup('gamepb.sharepb.ReportShareRequest')
    t.ReportShareReply = lookup('gamepb.sharepb.ReportShareReply')
    t.ClaimShareRewardRequest = lookup('gamepb.sharepb.ClaimShareRewardRequest')
    t.ClaimShareRewardReply = lookup('gamepb.sharepb.ClaimShareRewardReply')
    t.GetIllustratedListV2Request = lookup('gamepb.illustratedpb.GetIllustratedListV2Request')
    t.GetIllustratedListV2Reply = lookup('gamepb.illustratedpb.GetIllustratedListV2Reply')
    t.ClaimAllRewardsV2Request = lookup('gamepb.illustratedpb.ClaimAllRewardsV2Request')
    t.ClaimAllRewardsV2Reply = lookup('gamepb.illustratedpb.ClaimAllRewardsV2Reply')

    // 好友
    t.GetAllFriendsRequest = lookup('gamepb.friendpb.GetAllRequest')
    t.GetAllFriendsReply = lookup('gamepb.friendpb.GetAllReply')
    t.GetApplicationsRequest = lookup('gamepb.friendpb.GetApplicationsRequest')
    t.GetApplicationsReply = lookup('gamepb.friendpb.GetApplicationsReply')
    t.AcceptFriendsRequest = lookup('gamepb.friendpb.AcceptFriendsRequest')
    t.AcceptFriendsReply = lookup('gamepb.friendpb.AcceptFriendsReply')

    // 访问
    t.VisitEnterRequest = lookup('gamepb.visitpb.EnterRequest')
    t.VisitEnterReply = lookup('gamepb.visitpb.EnterReply')
    t.VisitLeaveRequest = lookup('gamepb.visitpb.LeaveRequest')
    t.VisitLeaveReply = lookup('gamepb.visitpb.LeaveReply')

    // 任务
    t.TaskInfoRequest = lookup('gamepb.taskpb.TaskInfoRequest')
    t.TaskInfoReply = lookup('gamepb.taskpb.TaskInfoReply')
    t.ClaimTaskRewardRequest = lookup('gamepb.taskpb.ClaimTaskRewardRequest')
    t.ClaimTaskRewardReply = lookup('gamepb.taskpb.ClaimTaskRewardReply')
    t.BatchClaimTaskRewardRequest = lookup('gamepb.taskpb.BatchClaimTaskRewardRequest')
    t.BatchClaimTaskRewardReply = lookup('gamepb.taskpb.BatchClaimTaskRewardReply')
    t.ClaimDailyRewardRequest = lookup('gamepb.taskpb.ClaimDailyRewardRequest')
    t.ClaimDailyRewardReply = lookup('gamepb.taskpb.ClaimDailyRewardReply')

    // 邮箱
    t.GetEmailListRequest = lookup('gamepb.emailpb.GetEmailListRequest')
    t.GetEmailListReply = lookup('gamepb.emailpb.GetEmailListReply')
    t.ClaimEmailRequest = lookup('gamepb.emailpb.ClaimEmailRequest')
    t.ClaimEmailReply = lookup('gamepb.emailpb.ClaimEmailReply')
    t.BatchClaimEmailRequest = lookup('gamepb.emailpb.BatchClaimEmailRequest')
    t.BatchClaimEmailReply = lookup('gamepb.emailpb.BatchClaimEmailReply')

    // 推送通知
    t.LandsNotify = lookup('gamepb.plantpb.LandsNotify')
    t.BasicNotify = lookup('gamepb.userpb.BasicNotify')
    t.KickoutNotify = lookup('gatepb.KickoutNotify')
    t.FriendApplicationReceivedNotify = lookup('gamepb.friendpb.FriendApplicationReceivedNotify')
    t.FriendAddedNotify = lookup('gamepb.friendpb.FriendAddedNotify')
    t.ItemNotify = lookup('gamepb.itempb.ItemNotify')
    t.GoodsUnlockNotify = lookup('gamepb.shoppb.GoodsUnlockNotify')
    t.TaskInfoNotify = lookup('gamepb.taskpb.TaskInfoNotify')

    this.logger.log('Protobuf 定义加载完成')
  }

  getRoot(): protobuf.Root | null {
    return this.root
  }
}
