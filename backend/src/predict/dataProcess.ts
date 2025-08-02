import { tierListOfServer } from "@/config"
import { logger } from "@/logger"
import { Character } from "@/types/Character"
import { Cutoff } from "@/types/Cutoff"
import { getPresentEvent, Event } from "@/types/Event"
import { Server } from "@/types/Server"
import * as holidays from "chinese-holidays"
import { predict } from "./predict"
import { getHistory, saveHistory } from "./predictHistory"
let book: holidays.Book
function getCharacter(event: Event) {
    const bandMap = {0:0, 1:1, 2:2, 3:3, 4:4, 5:5, 18:6, 21:7, 45:8}
    let bandId = -1
    for (let { characterId } of event.characters) {
        const character = new Character(characterId)
        if (bandId == -1)
            bandId = character.bandId
        else if (bandId != character.bandId)
            bandId = 0
    }
    return [[[bandMap[bandId]]]]
}
function getEventData(eventId: number, server: Server) {
    const eventTypeMap = {
        "story": 1,
        "versus": 2,
        "live_try": 3,
        "challenge": 4,
        "mission_live": 5,
        "festival": 6,
        "medley": 7
    }
    const event = new Event(eventId)
    const eventData = [[[eventTypeMap[event.eventType]]], ...getCharacter(event)]
    let startDate = new Date(event.startAt[server]), endDate = new Date(event.endAt[server])
    startDate.setHours(15)
    startDate.setMinutes(0)
    startDate.setSeconds(0)
    endDate.setHours(23)
    endDate.setMinutes(0)
    endDate.setSeconds(0)
    return { eventData, startAt: startDate.getTime(), endAt: endDate.getTime()}
}
export const maxEp = [0, 0, 559395.3037106916, 1072809.25, 3432275.0438158587, 1755539.0, 528890.8049925324, 650031.5840266235]
const stepLength = 12
const timeLength = 2 * 60 * 60 * 1000
function processCutoffs(cutoffs: Array<{ time: number, ep: number }>, startAt: number) {
    if (cutoffs.length == 0) {
        return [{time: startAt, ep: 0}]
    }
    let current = startAt, last = { time: current, ep: 0 }
    const rates: Array<{ time: number, ep: number }> = []
    for (const cutoff of cutoffs) {
        while (current <= cutoff.time) {
            const ep = (cutoff.ep - last.ep) / (cutoff.time - last.time) * (current - last.time) + last.ep
            rates.push({time: current, ep})
            current += timeLength
        }
        last = cutoff
    }
    for (let i = rates.length - 1; i > 0; i -= 1) {
        rates[i].ep -= rates[i - 1].ep
        if (rates[i].ep < 0)
            rates[i].ep = 0
    }
    return rates
}
function getTimeData (timestamp: number, startAt: number, endAt: number) {
    const date = new Date(timestamp)
    return [[[timestamp]], [[timeLength / (timestamp - startAt + timeLength), timeLength / (endAt - timestamp + timeLength)]], [[date.getDay()]], [[date.getHours()]], [[+book.isHoliday(date)]]]
}
function getAllTimeData(rates: Array<{ time: number, ep: number }>, startAt: number, endAt: number, base: number) {
    const timeData = [[], [], [], [], [], []], scoreData = [[]]
    for (let i = stepLength; i < rates.length; i += 1) {
        let sum = 0
        for (let j = i - stepLength; j < i; j += 1) {
            sum += Math.log(rates[j].ep + 1) / base
        }
        concatenate(timeData, [...getTimeData(rates[i].time, startAt, endAt), [sum / stepLength]])
        scoreData[0].push(Math.log(rates[i].ep + 1) / base)
    }
    return { timeData, scoreData }
}
function concatenate(a: Array<Array<any> >, b: Array<Array<any> > ) {
    for (let i = 0; i < a.length; i += 1) {
        a[i].push(...b[i])
    }
}
// export async function getAllData() {
//     const inputs = [[], [], [], [], [], [], [], []], outputs = [[]]
//     const server = Server.cn
//     const currentEvent = getPresentEvent(Server.cn)
//     for (let eventId = 226; eventId < currentEvent.eventId; eventId += 1) {
//         const { eventData, startAt, endAt} = getEventData(eventId, server)
//         for (let tier of tierListOfServer[Server[server]]) {
//             if (tier < 50) {
//                 continue
//             }
//             const cutoff = new Cutoff(eventId, server, tier)
//             await cutoff.initFull()
//             if (cutoff.cutoffs.length == 0) {
//                 continue
//             }
//             const rates = processCutoffs(cutoff.cutoffs, startAt)
//             const { timeData, scoreData } = getAllTimeData(rates, startAt, endAt, Math.log(maxEp[eventData[0][0]]))
//             const tmpData = [[], []]
//             for (let i = 0; i < scoreData[0].length; i += 1) {
//                 concatenate(tmpData, eventData)
//             }
//             tmpData.push(...timeData)
//             concatenate(inputs, tmpData)
//             concatenate(outputs, scoreData)
//         }
//     }
//     console.log(outputs[0].length)
//     return {inputs, outputs}
// }

export function continuePredict(eventId: number, tier: number, server: Server, cutoffs: Array<{ time: number, ep: number }>) {
    const { eventData, startAt, endAt} = getEventData(eventId, server)
    const rates = processCutoffs(cutoffs, startAt)
    if (rates.length <= stepLength) {
        return [{ time: 0, ep: 0 }]
    }
    const list = [], base = Math.log(maxEp[eventData[0][0][0]])
    let S = 0
    for (let i = rates.length - stepLength; i < rates.length; i++) {
        let cur = Math.log(rates[i].ep + 1) / base
        list.push([cur])
        S += cur
    }
    let cur = rates.at(-1).time + timeLength
    const result: Array<{ time: number, ep: number }> = [{time: rates.at(-1).time, ep: rates.map(rate => rate.ep).reduce((pre, cur) => pre + cur, 0)}]
    while(cur <= endAt) {
        const ep = predict([...eventData, ...getTimeData(cur, startAt, endAt), [[S / stepLength]]], tier)
        list.push([ep])
        const [last] = list.shift()
        S += ep - last
        result.push({time: cur, ep: Math.pow(maxEp[eventData[0][0][0]], ep) - 1})
        cur += timeLength
    }
    for (let i = 1; i < result.length; i += 1) {
        result[i].ep += result[i - 1].ep
    }
    return result
}

export async function initHolidays() {
    book = await holidays.ready()
    logger('holidays', "initializing done")
}
setInterval(initHolidays, 24 * 60 * 60 * 1000)

// async function continuePredict2(eventId: number, tier: number, server: Server, rates: Array<{ time: number, ep: number }>) {
//     const { eventData, startAt, endAt} = getEventData(eventId, server)
//     let cur = rates.at(-1).time + timeLength
//     const list = []
//     for (let i = rates.length - stepLength; i < rates.length; i++) {
//         list.push(i <= 0 ? [0] : [rates[i].ep])
//     }
//     const result: Array<{ time: number, ep: number }> = []
//     while(cur <= endAt) {
//         const ep = predict([...eventData, [tier], ...getTimeData(cur, startAt, endAt), [list]])
//         list.push([ep])
//         list.shift()
//         result.push({time: cur, ep})
//         cur += timeLength
//     }
//     result.unshift({time: rates.at(-1).time, ep: rates.map(rate => rate.ep).reduce((pre, cur) => pre + cur, 0)})
//     for (let i = 1; i < result.length; i += 1) {
//         result[i].ep += result[i - 1].ep
//     }
//     return result
// }

// async function initHistory(eventId: number, server: Server) {
//     const { startAt } = getEventData(eventId, server)
//     for(const tier of tierListOfServer[Server[server]]) {
//         const cutoff = new Cutoff(eventId, server, tier)
//         await cutoff.initFull()
//         const data = getHistory(eventId, tier, server, true)
//         if (cutoff.cutoffs.length == 0)
//             continue
//         const rates = processCutoffs(cutoff.cutoffs, startAt)
//         while (rates.length > 1) {
//             const cur = rates.pop().time
//             if (data[cur])
//                 continue
//             console.log(rates.length)
//             const result = await continuePredict2(eventId, tier, server, rates)
//             data[cur] = result.at(-1).ep
//             saveHistory(eventId, tier, server, true, data)
//         }
//     }
// }
// (async () => {
//     await new Promise(resolve => setTimeout(resolve, 10 * 1000))
//     initHistory(276, 3)
// })()

