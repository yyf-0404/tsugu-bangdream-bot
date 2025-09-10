import { Card } from "@/types/Card"
import { Event } from "@/types/Event"
import { Skill, scoreUp } from "@/types/Skill"
import { AreaItem, AreaItemType } from "@/types/AreaItem"
import mainAPI from "@/types/_Main"
import { Stat, addStat, subStat, mulStat, statSum, emptyStat } from "@/types/Card"
import { writeFile } from 'fs'
import ArrayTypeFuc from "ref-array-di";
import * as ref from "ref-napi";

export const IntArray = ArrayTypeFuc(ref)(ref.types.int)

export const limit = 60
export const medleyLimit = 31
export const eventTypeList = [
  'medley', 
  'versus', 
  'challenge'
]

export class cardInfo{
    card: Card
    illustTrainingStatus?: boolean
    limitBreakRank?: number
    skillLevel?: number
    stat?: Stat
    eventAddStat?: Stat
    duration?: number
    scoreUp?: scoreUp
    rateup?: boolean
    addUpStat?: number
    constructor(cardId) {
        this.card = new Card(parseInt(cardId))
    }
    async initFull(event: Event, player: playerDetail) {
        const key = this.card.cardId.toString()
        this.illustTrainingStatus = player.cardList[key].illustTrainingStatus,
        this.limitBreakRank = player.cardList[key].limitBreakRank,
        this.skillLevel = player.cardList[key].skillLevel
        this.stat = await this.card.calcStat()
        const add = this.card.rarity * this.limitBreakRank * 50
        addStat(this.stat, {
            performance: add,
            technique: add,
            visual: add
        })
        
        {
            const tmpStat1 = mulStat(this.stat, player.characterBouns[this.card.characterId].potential)
            const tmpStat2 = mulStat(this.stat, player.characterBouns[this.card.characterId].characterTask)
            addStat(this.stat, {
                performance: Math.floor(tmpStat1.performance),
                technique: Math.floor(tmpStat1.technique),
                visual: Math.floor(tmpStat1.visual)
            })
            addStat(this.stat, {
                performance: Math.floor(tmpStat2.performance),
                technique: Math.floor(tmpStat2.technique),
                visual: Math.floor(tmpStat2.visual)
            })
        }

        {
            const tmpStat: Stat = {
                performance: 0,
                technique: 0,
                visual: 0
            }
            var flag: number = 0
            for (const { attribute, percent } of event.attributes) {
                if (attribute == this.card.attribute) {
                    flag |= 1
                    addStat(tmpStat, {
                        performance: percent,
                        technique: percent,
                        visual: percent
                    })
                }
            }
            
            for (const { characterId, percent } of event.characters) {
                if (characterId == this.card.characterId) {
                    flag |= 2
                    addStat(tmpStat, {
                        performance: percent,
                        technique: percent,
                        visual: percent
                    })
                }
            }
            
            for (const { situationId, percent } of event.members) {
                if (situationId == this.card.cardId) {
                    addStat(tmpStat, {
                        performance: percent,
                        technique: percent,
                        visual: percent
                    })
                }
            }

            if (flag == 3) {
                if (Object.keys(event.eventCharacterParameterBonus).length > 0) {
                    //@ts-ignore
                    addStat(tmpStat, event.eventCharacterParameterBonus)
                }
                const percent = event.eventAttributeAndCharacterBonus.parameterPercent
                addStat(tmpStat, {
                    performance: percent,
                    technique: percent,
                    visual: percent
                })
            }

            {
                const percent = event.limitBreaks[this.card.rarity][this.limitBreakRank]
                addStat(tmpStat, {
                    performance: percent,
                    technique: percent,
                    visual: percent
                })
            }

            tmpStat.performance /= 100
            tmpStat.technique /= 100
            tmpStat.visual /= 100
            this.eventAddStat = mulStat(this.stat, tmpStat)
        }

        const skill: Skill = this.card.getSkill()
        this.duration = skill.duration[this.skillLevel - 1]
        this.scoreUp = skill.getScoreUp()
        this.rateup = skill.skillId == 61
    }
    calcStat(areaItem, bandId, attribute, magazine) {
        const tmpStat: Stat = {
            performance: 0,
            technique: 0,
            visual: 0
        }
        if (bandId == '1000' || bandId == this.card.bandId.toString()) {
            addStat(tmpStat, mulStat(this.stat, areaItem[AreaItemType.band][bandId].stat))
        }
        if (attribute == '~all' || attribute == this.card.attribute) {
            addStat(tmpStat, mulStat(this.stat, areaItem[AreaItemType.attribute][attribute].stat))
        }
        addStat(tmpStat, mulStat(this.stat, areaItem[AreaItemType.magazine][magazine].stat))
        addStat(tmpStat, this.stat)
        addStat(tmpStat, this.eventAddStat)
        this.addUpStat = statSum(tmpStat)
    }
}
export class teamInfo{
    set: number
    stat: number
    team: Array<cardInfo>
    score: Array<number>
    order: Array<Array<cardInfo>>
    capital: Array<cardInfo>
    scoreUp: Array<Array<number> >
    meta: Array<number>
    constructor() {
        this.set = 0
        this.stat = 0
        this.team = []
        this.score = []
        this.order = []
        this.capital = []
        this.scoreUp = []
        this.meta = []
    }
    calcStat() {
        this.stat = 0
        for (const { addUpStat } of this.team) {
            this.stat += addUpStat
        }
    }
}

export class buildResult {
    songList?: Array<{
        songId: number,
        difficulty: number
    }>
    description?: string
    totalScore: number
    totalStat: number
    score: Array<number>
    stat: Array<number>
    team: Array<Array<cardInfo>>
    capital: Array<cardInfo>
    item: Object
    constructor(list) {
      this.songList = list
      this.totalScore = 0
      this.totalStat = 0
      this.score = []
      this.stat = []
      this.item = {}
      this.capital = []
      this.team = []
    }
    upd(teamList: Array<teamInfo>, plan: Array<number>, bandId, attribute, magazine) {
      if (!plan || plan.length == 0 || plan[0] == -1) return
      this.totalScore = 0
      this.totalStat = 0
      this.score = []
      this.stat = []
      this.capital = []
      this.team = []
      for (let i = 0; i < this.songList.length; i += 1) {
        try {
          const info: teamInfo = teamList[plan[i]]
          this.totalScore += info.score[i]
          this.totalStat += info.stat
          this.score.push(info.score[i])
          this.stat.push(Math.floor(info.stat))
          this.team.push(info.order[i])
          this.capital.push(info.capital[i])
        }
        catch (e) {
          console.log(plan[i])
          throw new Error(e)
        }
      }
      this.totalStat = Math.floor(this.totalStat)
      this.item[AreaItemType.band] = bandId
      this.item[AreaItemType.attribute] = attribute
      this.item[AreaItemType.magazine] = magazine
    }
    print() {
      console.log(this.totalScore, this.totalStat)
      console.log(this.score, this.stat)
      for (var i = 0; i < this.team.length; i += 1) {
          console.log(this.team[i].map((info) => info.card.cardId), this.capital[i].card.cardId)
          console.log(this.team[i].map(info => statSum(info.stat)), this.team[i].map(info => statSum(info.stat)).reduce((pre, cur) => pre + cur, 0))
      }
      console.log(this.item[0], this.item[1], this.item[2])
    }
}
export class dataEntries {
  data: [number, number, any, any]
  constructor(maxScore: number, teamList: Array<teamInfo>) {
    const n = teamList.length
    const S = [], f = []
    for (const info of teamList) {
      S.push(info.set)
      for (let i = 0; i < 3; i++) {
        f.push(info.score[i])
      }
    }
    this.data = [n, maxScore, new IntArray(S), new IntArray(f)]
  }
  save(filename: string) {
    let msg: string = '', n = this.data[0]
    msg += n + '\n'
    for (let i = 0; i < n; i++) {
      msg += this.data[2][i]
      if (i == n - 1) msg += '\n'
      else msg += ' '
    }
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < n; j += 1){
        msg += this.data[3][j * 3 + i]
        if (j == n - 1) msg += '\n'
        else msg += ' '
      }
    }
    writeFile(filename, msg, (err) => {
      if (err) console.log(err)
    })
  }
}


export class playerDetail {
  playerId: number
  eventSongs: {
    [eventId: number]: Array<{
      songId: number
      difficulty: number
    }>
  }
  currentEvent: number
  cardList: {
    [cardId: number]: {
      illustTrainingStatus: boolean
      limitBreakRank: number
      skillLevel: number
    }
  }
  areaItem: {
    [areaItemId: number]: {
      level: number
    }
  }
  characterBouns: {
    [characterId: number]: {
      potential: Stat,
      characterTask: Stat
    }
  }
  constructor(playerId: number) {
    this.playerId = playerId
  }
  init(data? : playerDetail) {
    this.eventSongs = {}
    this.cardList = {}
    this.areaItem = {}
    this.characterBouns = {}
    const areaItemData = mainAPI['areaItems']
    for (const areaItemId in areaItemData) {
      this.areaItem[areaItemId] = { level: 0 }
    }
    const characterData = mainAPI['characters']
    for (const characterId in characterData) {
      this.characterBouns[characterId] = {
        potential: emptyStat(),
        characterTask: emptyStat()
      }
    }
    if (data) {
      this.eventSongs = data.eventSongs
      this.cardList = data.cardList
      this.areaItem = data.areaItem
      this.characterBouns = data.characterBouns
      this.currentEvent = data.currentEvent
    }
  }
  getCharacterCardCount() {
    const characterCardCount = {}
    for (const characterId in mainAPI['characters']) {
      characterCardCount[characterId] = 0
    }
    for (const cardId in this.cardList) {
      const card = new Card(parseInt(cardId))
      characterCardCount[card.characterId] += 1
    }
    return characterCardCount
  }
  checkComposeTeam(count: number) {
      var sum : number = 0
      const characterCardCount = this.getCharacterCardCount()
      for (const characterId in characterCardCount) {
          sum += Math.min(count, characterCardCount[characterId])
      }
      return sum >= 5 * count
  }
  // getInitTeam(count: number) {
  //   const list = Object.keys(this.cardList).map((cardId) => {
  //     const card = new Card(parseInt(cardId))
  //     return {
  //       cardId,
  //       characterId: card.characterId
  //     }
  //   })
  //   const used = new Set(), initTeam = Array.from({ length: count }, () => new Array<number> ()), characterCardCount = this.getCharacterCardCount()
  //   for (var i = 0; i < count; i += 1) {
  //     list.sort((a, b) => characterCardCount[b.characterId] - characterCardCount[a.characterId])
  //     console.log(list.map((a) => characterCardCount[a.characterId]))
  //     const characterSet = new Set()
  //     for (var j = 0; j < list.length; j += 1) {
  //       if (characterSet.size == 5) {
  //         break
  //       }
  //       if (used.has(j)) {
  //         continue
  //       }
  //       if (characterSet.has(list[j].characterId)) {
  //         continue
  //       }
  //       initTeam[i].push(parseInt(list[j].cardId))
  //       characterSet.add(list[j].characterId)
  //       used.add(j)
  //       characterCardCount[list[j].characterId] -= 1
  //     }
  //   }
  // }
  getAreaItemPercent() : Array<{
      [id: string | number] : {
        stat: Stat
      }
  }> {
    const areaItemPercent = [{}, {}, {}]
    for (const areaItemId in this.areaItem) {
      const item = new AreaItem(parseInt(areaItemId))
      try {
        var type = item.getType()
      } catch{
        console.log(parseInt(areaItemId))
      }
      let id
      switch(type){
        case AreaItemType.band:
          id = item.targetBandIds.length == 1 ? item.targetBandIds[0] : 1000
          break
        case AreaItemType.attribute:
          id = item.targetAttributes.length == 1 ? item.targetAttributes[0]: "~all"
          break
        case AreaItemType.magazine:
          if (item.areaItemId == 80)
            id = 'performance'
          if (item.areaItemId == 81)
            id = 'technique'
          if (item.areaItemId == 82)
            id = 'visual'
      }
      if (!areaItemPercent[type][id]) {
        const emptyStat: Stat = {
          performance: 0,
          technique: 0,
          visual: 0
        }
        areaItemPercent[type][id] = {
          stat: emptyStat
        }
      }
      addStat(areaItemPercent[type][id].stat, item.getPercent(this.areaItem[areaItemId].level))
    }
    //海螺包和极上咖啡需要取最大值
    const minLevel = this.areaItem[59].level < this.areaItem[72].level ? 59 : 72
    subStat(areaItemPercent[AreaItemType.attribute]['~all'].stat, (new AreaItem(minLevel)).getPercent(this.areaItem[minLevel].level))
    return areaItemPercent
  }
}