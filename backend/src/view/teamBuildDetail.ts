import { Event } from '@/types/Event';
import { Card } from '@/types/Card'
import { drawList, drawListByServerList, drawListMerge, drawListTextWithImages } from '@/components/list';
import { drawDottedLine } from '@/image/dottedLine'
import { drawDatablock } from '@/components/dataBlock'
import { Image, Canvas } from 'skia-canvas'
import { drawAttributeInList } from '@/components/list/attribute'
import { drawCharacterInList } from '@/components/list/character'
import { statConfig } from '@/components/list/stat'
import { Server } from '@/types/Server';
import { drawTitle } from '@/components/title'
import { outputFinalBuffer } from '@/image/output'
import { Song } from '@/types/Song'
import { drawSongInListBig } from '@/components/list/song';
import { resizeImage, stackImage } from '@/components/utils';
import { drawCardIcon } from '@/components/card'
import { eventTypeList, playerDetail } from '@/teamBuilder/types';
import { drawText } from '@/image/text';
import { AreaItemType, AreaItemTypeList } from '@/types/AreaItem';
import { Band } from '@/types/Band';
import { Attribute } from '@/types/Attribute'
import mainAPI from '@/types/_Main';
import { Character } from '@/types/Character';
import { drawRoundedRectWithText } from '@/image/drawRect';
import { medleyLimit, limit } from '@/teamBuilder/types';
import { checkCard } from '@/teamBuilder/dataPrepare';
export async function drawTeamBuildDetail(player: playerDetail, server: Server, useEasyBG: boolean, compress: boolean) {
    const event = new Event(player.currentEvent)
    if (!event.isExist) {
        return ['错误: 活动不存在']
    }
    if (!eventTypeList.includes(event.eventType)) {
        return ['错误：活动序号' + player.currentEvent + `类型为${event.eventType}，请使用 组队计算+活动序号 设置正确的活动`]
    }
    let defaultServer: Server = server
    if (!event.startAt[defaultServer]) {
        defaultServer = Server.jp
    }
    await event.initFull()
    var list: Array<Image | Canvas> = []
    const widthMax = 1200, line: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 5,
        startY: 15,
        endX: widthMax - 5,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })

    //bannner
    var eventBannerImage = await event.getBannerImage()
    list.push(resizeImage({
        image: eventBannerImage,
        widthMax
    }))
    list.push(new Canvas(widthMax, 30))

    //标题
    list.push(await drawListByServerList(event.eventName, '活动名称', [defaultServer], widthMax))
    list.push(line)

    //类型
    var typeImage = drawList({
        key: '类型', text: event.getTypeName(), maxWidth: widthMax
    })

    //活动ID
    var IdImage = drawList({
        key: 'ID', text: event.eventId.toString(), maxWidth: widthMax
    })

    list.push(drawListMerge([typeImage, IdImage], widthMax))
    list.push(line)

    //活动属性加成
    var attributeImage = []
    attributeImage.push(drawList({
        key: '活动加成'
    }))
    var attributeList = event.getAttributeList()
    for (const i in attributeList) {
        if (Object.prototype.hasOwnProperty.call(attributeList, i)) {
            const element = attributeList[i];
            attributeImage.push(await drawAttributeInList({
                content: element,
                text: ` +${i}%`
            }))
        }
    }

    //活动角色加成
    var characterImage = []
    characterImage.push(drawList({
        key: '活动角色加成'
    }))
    var characterList = event.getCharacterList()
    for (const i in characterList) {
        if (Object.prototype.hasOwnProperty.call(characterList, i)) {
            const element = characterList[i];
            characterImage.push(await drawCharacterInList({
                content: element,
                text: ` +${i}%`
            }))
        }
    }

    //活动偏科加成(stat)
    var statText = ''
    for (const i in event.eventCharacterParameterBonus) {
        if (i == 'eventId') {
            continue
        }
        if (Object.prototype.hasOwnProperty.call(event.eventCharacterParameterBonus, i)) {
            const element = event.eventCharacterParameterBonus[i];
            if (element == 0) {
                continue
            }
            statText += `${statConfig[i].name} + ${element}%  `
        }
    }
    var statImage = drawList({
        key: '活动偏科加成',
        text: statText
    })
    list.push(drawListMerge([stackImage(attributeImage), stackImage(characterImage), undefined, statImage], widthMax))
    list.push(line)
    
    //成员加成
    list.push(drawList({
        key: '活动成员加成'
    }))
    var cardList = event.getMemberList()
    for (const i in cardList) {
        if (Object.prototype.hasOwnProperty.call(cardList, i)) {
            // const element = cardList[i];
            const cardIconList = []
            for (const card of cardList[i]) {
                cardIconList.push(await drawCardIcon({
                    card,
                    cardIdVisible: true,
                    skillTypeVisible: true,
                    cardTypeVisible: true,
                    trainingStatus: false
                }))
            }
            cardIconList.push(`  +${i}%`)
            list.push(drawListTextWithImages({
                content: cardIconList,
                maxWidth: widthMax
            }))
        }
    }
    
    var listImage = drawDatablock({ list })
    //创建最终输出数组

    var all = []
    all.push(drawTitle('查询', '活动'))

    all.push(listImage)

    //选择歌曲
    const songList = player.eventSongs[player.currentEvent], songImage = []
    for (const { songId, difficulty } of songList) {
        songImage.push(await drawSongInListBig(new Song(songId), difficulty))
    }
    all.push(drawDatablock({
        topLeftText: '选择歌曲',
        list: [drawListMerge(songImage, widthMax, true, "bottom")]
    }))

    //卡牌列表
    const cardIconList = []
    for (const cardId in player.cardList) {
        const { illustTrainingStatus, limitBreakRank, skillLevel } = player.cardList[cardId]
        cardIconList.push(await drawCardIcon({
            card: new Card(parseInt(cardId)),
            trainingStatus: true,
            illustTrainingStatus: illustTrainingStatus,
            limitBreakRank,
            cardIdVisible: true,
            skillTypeVisible: true,
            cardTypeVisible: false,
            skillLevel
        }))
    }
    const cardIconListInList = [], rowMax = 6
    for (var i = 0; i < cardIconList.length && i < limit; i += rowMax) {
        cardIconListInList.push(drawListTextWithImages({
            content: cardIconList.slice(i, i + rowMax),
            spacing: 16,
            maxWidth: widthMax
        }))
    }
    let msg = checkCard(player, event.eventType, cardIconList.length)
    if (msg.length > 0) {
        cardIconListInList.push(drawText({
            text: msg,
            maxWidth: widthMax
        }))
    }
    all.push(drawDatablock({
        topLeftText: '卡牌列表',
        list: cardIconListInList,
        maxWidth: widthMax
    }))

    //区域道具加成
    const areaItemList = [], areaItemPercent = player.getAreaItemPercent()
    for (const key in areaItemPercent) {
        areaItemList.push(drawList({
            key: AreaItemTypeList[key],
            maxWidth: widthMax
        }))
        const list = []
        let rowMax
        switch (parseInt(key)) {
            case AreaItemType.band:
                for (const bandId in areaItemPercent[key]) {
                    const content = []
                    content.push(bandId == '1000' ? drawText({
                        text: '全部乐队',
                        maxWidth: widthMax
                    }) : resizeImage({
                        image: await (new Band(parseInt(bandId))).getLogo(),
                        heightMax: 80
                    }))
                    content.push(` +${Math.round(areaItemPercent[key][bandId].stat.performance * 10000) / 100}%`)
                    list.push(drawListTextWithImages({
                        content,
                        maxWidth: widthMax
                    }))
                }
                rowMax = 3
                break
            case AreaItemType.attribute:
                const keys = Object.keys(areaItemPercent[key])
                keys.sort()
                for (const attribute of keys) {
                    const content = []
                    content.push(attribute == '~all' ? drawText({
                        text: '全部颜色',
                        maxWidth: widthMax
                    }) : resizeImage({
                        image: await (new Attribute(attribute)).getIcon(),
                        heightMax: 40
                    }))
                    content.push(` +${Math.round(areaItemPercent[key][attribute].stat.performance * 10000) / 100}%`)
                    list.push(drawListTextWithImages({
                        content,
                        lineSpacing: 40,
                        maxWidth: widthMax
                    }))
                }
                rowMax = 4
                break
            case AreaItemType.magazine:
                for (const stat in areaItemPercent[key]) {
                    const text = `${statConfig[stat].name} +${Math.round(areaItemPercent[key][stat].stat[stat] * 10000) / 100}%`
                    list.push(drawList({
                        text,
                        lineSpacing: 40,
                        maxWidth: widthMax
                    }))
                }
                rowMax = 3
                break
        }
        for (var i = 0; i < list.length; i += rowMax) {
            const tmplist = list.slice(i, i + rowMax)
            areaItemList.push(drawListMerge(tmplist, widthMax, false, "center"))
        }
        areaItemList.push(line)
    }
    areaItemList.pop()
    all.push(drawDatablock({
        topLeftText: '区域道具加成',
        list: areaItemList
    }))

    //角色加成

    const characterBounsList = []
    {
        const canvas = new Canvas(widthMax, 100)
        const ctx = canvas.getContext("2d")
        ctx.drawCanvas(drawRoundedRectWithText({
            text: `演出`,
            textSize: 40,
            height: 60,
            color: "#E675A0"
        }), 130, 0)
        ctx.drawCanvas(drawRoundedRectWithText({
            text: `技巧`,
            textSize: 40,
            height: 60,
            color: "#6EB8E7"
        }), widthMax / 3 + 130, 0)
        ctx.drawCanvas(drawRoundedRectWithText({
            text: `形象`,
            textSize: 40,
            height: 60,
            color: "#F6C964"
        }), widthMax / 3 * 2 + 130, 0)
        const list = [], rowMax = 5, iconWidth = 50, height = 150, spacing = 5, bouns = player.characterBouns, width = widthMax / rowMax
        for (const i in mainAPI['characters']) {
            const character = new Character(parseInt(i))
            const icon = resizeImage({
                image: await character.getIcon(),
                heightMax: iconWidth
            })
            const canvas = new Canvas(width, height)
            const ctx = canvas.getContext("2d")
            ctx.drawImage(icon, spacing, (height - iconWidth) / 2)
            ctx.drawCanvas(drawRoundedRectWithText({
                text: `${(bouns[i].potential.performance * 100).toFixed(1)}% ${(bouns[i].characterTask.performance * 100).toFixed(1)}%`,
                textSize: 25,
                color: "#E675A0",
                height: 40,
                width: width - iconWidth - 3 * spacing,
            }), iconWidth + 2 * spacing, spacing)
            ctx.drawCanvas(drawRoundedRectWithText({
                text: `${(bouns[i].potential.technique * 100).toFixed(1)}% ${(bouns[i].characterTask.technique * 100).toFixed(1)}%`,
                textSize: 25,
                color: "#6EB8E7",
                height: 40,
                width: width - iconWidth - 3 * spacing
            }), iconWidth + 2 * spacing, height / 3 + spacing)
            ctx.drawCanvas(drawRoundedRectWithText({
                text: `${(bouns[i].potential.visual * 100).toFixed(1)}% ${(bouns[i].characterTask.visual * 100).toFixed(1)}%`,
                textSize: 25,
                color: "#F6C964",
                height: 40,
                width: width - iconWidth - 3 * spacing
            }), iconWidth + 2 * spacing, height / 3 * 2 + spacing)
            list.push(canvas)
        }
        characterBounsList.push(canvas)
        for (let i = 0; i < list.length; i += rowMax) {
            const tmplist = list.slice(i, i + rowMax)
            characterBounsList.push(drawListMerge(tmplist, widthMax, false, "center"))
            characterBounsList.push(new Canvas(1, 5))
        }
        characterBounsList.pop()
    }
    all.push(drawDatablock({
        topLeftText: '角色加成',
        list: characterBounsList
    }))
    
    
    var BGimage = useEasyBG ? undefined : (await event.getEventBGImage())

    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: useEasyBG,
        BGimage,
        text: 'Event',
        compress: compress,
    })

    return [buffer];
}