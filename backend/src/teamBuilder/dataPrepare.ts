import { playerDetail, teamInfo, eventTypeList, cardInfo, limit, medleyLimit, buildResult, dataEntries } from "./types";
import { Server } from "@/types/Server";
import { Event } from "@/types/Event";
import { Song } from "@/types/Song";
import { AreaItemType } from "@/types/AreaItem";
import { Library } from "ffi-napi"
import path from "path"
import { IntArray }  from "./types"
const lib = Library(path.join(__dirname, 'lib', 'libcalc'), {
    'calc': ['int', ['int', 'int', IntArray, IntArray, IntArray]],
    'calc1': ['int', ['int', 'int', IntArray, IntArray, IntArray]],
    'calc2': ['int', ['int', 'int', IntArray, IntArray, IntArray]]
})

export function checkCard(player: playerDetail, eventType: string, length: number) : string {
    if (length == 0) {
        return '还没有添加卡牌呢，使用 导入配置 或者 添加卡牌 来添加吧'
    }
    if (length > limit) {
        return `当前卡牌数大于${limit}张，列表过长无法显示，请使用 删除卡牌 减少几张卡吧`
    }
    if (eventType == 'medley' && length > medleyLimit) {
        return `当前卡牌数大于${medleyLimit}张，计算时间过长，无法进行组队，请使用 删除卡牌 减少几张卡吧`
    }
    if (!player.checkComposeTeam(eventType == 'medley' ? 3 : 1)) {
        return '当前卡牌过少，无法进行组队，使用 导入配置 或者 添加卡牌 来添加吧'
    }
    return ''
}
export async function dataPrepare(player: playerDetail, server: Server) {
    const event = new Event(player.currentEvent)
    if (!event.isExist) {
        throw new Error('错误: 活动不存在')
    }
    if (!eventTypeList.includes(event.eventType)) {
        throw new Error(`错误：活动序号${player.currentEvent}类型为${event.eventType}，请使用 组队计算+活动序号 设置正确的活动`)
    }
    let defaultServer: Server = server
    if (!event.startAt[defaultServer]) {
        defaultServer = Server.jp
    }
    await event.initFull()

    const songList = player.eventSongs[player.currentEvent]
    const charts = await Promise.all(songList.map(async ({ songId, difficulty} ) => {
        const song = new Song(songId)
        await song.initFull()
        return await song.getChartData(difficulty)
    }))
    var notes = 0
    for (var i = 0; i < charts.length; i += 1) {
        charts[i].init(notes, event.eventType.toLowerCase() == 'medley')
        notes += charts[i].count
    }

    const cardList: Array<cardInfo> = Object.keys(player.cardList).map(key => new cardInfo(key))


    let msg = checkCard(player, event.eventType, cardList.length)
    if (msg.length > 0) {
        throw Error(msg)
    }
    for (const info of cardList) {
        await info.initFull(event, player)
    }

    const teamList: Array<teamInfo> = []
    {
        const characterSet : Set<number> = new Set()
        function initTeamList(depth: number = 0, Set: number = 0, team: Array<cardInfo> = []) {
            if (depth == 5) {
                const info = new teamInfo()
                info.team = team
                info.set = Set

                let bandId, attribute
                for (const info of team) {
                    if (!bandId) bandId = info.card.bandId
                    if (bandId != info.card.bandId) bandId = 1000

                    if (!attribute) attribute = info.card.attribute
                    if (attribute != info.card.attribute) attribute = '~all'
                }

                const scoreUp = team.map(info => {
                    if (info.scoreUp.unificationActivateEffectValue) {
                        if (info.scoreUp.unificationActivateConditionBandId && info.scoreUp.unificationActivateConditionBandId != bandId)
                            return info.scoreUp.default
                        if (info.scoreUp.unificationActivateConditionType && info.scoreUp.unificationActivateConditionType.toLocaleLowerCase() != attribute)
                            return info.scoreUp.default
                        // console.log(info.scoreUp.unificationActivateConditionType, attribute)
                        return info.scoreUp.unificationActivateEffectValue
                    }
                    return info.scoreUp.default
                })

                for (var i = 0; i < charts.length; i += 1) {
                    const res = charts[i].getMaxMetaOrder(team, scoreUp)
                    info.order.push(res.team)
                    info.capital.push(res.capital)
                    info.scoreUp.push(res.scoreUp)
                    info.meta.push(res.meta)
                }
                teamList.push(info)
                return
            }
            for (var i = 0; i < cardList.length; i += 1) {
                let id = cardList[i].card.characterId
                // console.log(characterSet)
                if (Set >> i & 1) {
                    break
                }
                if (characterSet.has(id)) continue
                characterSet.add(id)
                initTeamList(depth + 1, Set | 1 << i, [cardList[i], ...team])
                characterSet.delete(id)
            }
        }
        initTeamList()
        console.log(teamList.length)
    }

    const areaItem = player.getAreaItemPercent()
    const res: buildResult = new buildResult(songList)
    if (event.eventType == 'medley') {
        function generateTeamList(bandId, attribute, magazine) {
            for (const info of cardList) {
                info.calcStat(areaItem, bandId, attribute, magazine)
            }
            for (const info of teamList) {
                info.calcStat()
                info.score = charts.map((chart, i) => chart.getScore([...info.order[i], info.capital[i]], info.scoreUp[i], Math.floor(info.stat), true))
            }
            let abortSet = 0
            for (let i = 0; i < cardList.length; i++) {
                const cnt = {}, scoreUpMaxValue = cardList[i].scoreUp.unificationActivateEffectValue || cardList[i].scoreUp.default
                for (const info of cardList) {
                    if (info.addUpStat > cardList[i].addUpStat && info.scoreUp.default >= scoreUpMaxValue)
                        cnt[info.card.characterId] += 1
                }
                let sum = 0
                for (const characterId in cnt) {
                    if (characterId == cardList[i].card.characterId.toString() && sum >= 3)
                        abortSet |= 1 << i
                    sum += Math.min(3, cnt[characterId]) 
                }
                if (sum >= 15)
                    abortSet |= 1 << i
            }
            const teamInfoList: Array<teamInfo> = teamList.filter(info => (info.set & abortSet) == 0)
            return teamInfoList
        }
        for (const magazine in areaItem[AreaItemType.magazine]) {
            let eventBandId = event.bandId[0], eventAttribute = event.attribute[0]
            if (eventBandId == 0) eventBandId = 1000
            let tmpTeamList = generateTeamList(eventBandId, eventAttribute, magazine)
            let { data } = new dataEntries(res.totalScore, tmpTeamList)
            const plan = new IntArray([-1, -1, -1])
            const tmpScore = lib.calc(...data, plan)
            if (tmpScore > res.totalScore) {
                res.upd(tmpTeamList, Array.from(plan) as Array<number>, eventBandId, eventAttribute, magazine)
            }
            for (const bandId in areaItem[AreaItemType.band]) {
                for (const attribute in areaItem[AreaItemType.attribute]) {
                    if (bandId == eventBandId.toString() && attribute == eventAttribute)
                        continue
                    tmpTeamList = generateTeamList(bandId, attribute, magazine)
                    let data = new dataEntries(res.totalScore, tmpTeamList)
                    const plan = new IntArray([-1, -1, -1])
                    const tmpScore = lib.calc(...data.data, plan)
                    if (tmpScore > res.totalScore) {
                        res.upd(tmpTeamList, Array.from(plan) as Array<number>, bandId, attribute, magazine)
                    }
                }
            }
        }
    }
    else {
        for (const magazine in areaItem[AreaItemType.magazine]) {
            for (const bandId in areaItem[AreaItemType.band]) {
                for (const attribute in areaItem[AreaItemType.attribute]) {
                    for (const info of cardList) {
                        info.calcStat(areaItem, bandId, attribute, magazine)
                    }
                    for (let i = 0; i < teamList.length; i += 1) {
                        const info = teamList[i]
                        info.calcStat()
                        if (info.stat * info.meta[0] > res.totalScore) {
                            info.score = charts.map((chart, i) => chart.getScore([...info.order[i], info.capital[i]], info.scoreUp[i], Math.floor(info.stat), true))
                            if (info.score[0] > res.totalScore) {
                                res.upd(teamList, [i], bandId, attribute, magazine)
                            }
                        }
                    }
                }
            }
        }
    }
    return res
}