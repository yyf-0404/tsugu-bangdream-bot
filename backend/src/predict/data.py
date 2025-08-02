import holidays
from datetime import datetime
from utils import get_json_from_url
from predict import predict
from math import log, pow
Bestdoriurl = 'https://bestdori.com'
tierListOfServer = {
    3: [20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 50000, 70000, 100000]
}
cn_holidays = holidays.CountryHoliday('CN')
eventAll = get_json_from_url(f"{Bestdoriurl}/api/events/all.6.json")
characterData = get_json_from_url(f"{Bestdoriurl}/api/characters/main.3.json")
def get_character(event):
    global characterData
    bandMap = {0:0, 1:1, 2:2, 3:3, 4:4, 5:5, 18:6, 21:7, 45:8}
    bandId = -1
    list = []
    for info in event['characters']:
        list.append(info['characterId'])
        curBand = characterData[str(info['characterId'])]['bandId']
        if bandId == -1:
            bandId = curBand
        elif bandId != 0 and bandId != curBand:
            bandId = 0
    while len(list) < 10:
        list.append(0)
    return [[bandMap[bandId]]]

def getEventData(eventId, server):
    global eventAll
    eventTypeMap = {
        "story": 1,
        "versus": 2,
        "live_try": 3,
        "challenge": 4,
        "mission_live": 5,
        "festival": 6,
        "medley": 7
    }
    event = eventAll[str(eventId)]
    eventData = [[eventTypeMap[event['eventType']]]]
    eventData.extend(get_character(event))
    startDate = datetime.fromtimestamp(int(event['startAt'][server]) / 1000).replace(hour=15, minute=0, second=0)
    endDate = datetime.fromtimestamp(int(event['endAt'][server]) / 1000).replace(hour=23, minute=0, second=0)
    return eventData, int(startDate.timestamp() * 1000), int(endDate.timestamp() * 1000)

def processCutoffs(cutoffs, startAt):
    if len(cutoffs) == 0:
        return [{'time': startAt, 'ep': 0}]
    current = startAt
    last = {'time': startAt, 'ep': 0}
    rates = []
    for cutoff in cutoffs:
        while current <= cutoff['time']:
            ep = (cutoff['ep'] - last['ep']) / (cutoff['time'] - last['time']) * (current - last['time']) + last['ep']
            rates.append({'time': current, 'ep': ep})
            current += time_length
        last = cutoff
    for i in range(len(rates) - 1, 0, -1):
        rates[i]['ep'] -= rates[i - 1]['ep']
        if (rates[i]['ep'] < 0):
            rates[i]['ep'] = 0
    return rates

def getTimeData (timestamp, startAt, endAt):
    date = datetime.fromtimestamp(timestamp / 1000)
    return [[timestamp], [[time_length / (timestamp - startAt + time_length), time_length / (endAt - timestamp + time_length)]], [date.weekday()], [date.hour], [(int)(date in cn_holidays)]]
step_length = 12
time_length = 2 * 60 * 60 * 1000
presentEvent = 282
maxEp = [0, 0, 559395.3037106916, 1072809.25, 3432275.0438158587, 1755539.0, 528890.8049925324, 650031.5840266235]
def getTimeAndSequenceData(rates, startAt, endAt, eventType):
    global step_length
    data = [[] for i in range(6)]
    res = [[]]
    weight = []
    base = maxEp[eventType]
    for i in range(step_length, len(rates)):
        sum = 0
        for j in range(i - step_length, i):
            cur = 0 if j <= 0 else rates[j]['ep']
            sum += log(cur + 1, base)
        sum /= step_length
        tmp = getTimeData(rates[i]['time'], startAt, endAt)
        tmp.append([sum])
        concatenate(data, tmp)
        res[0].append(log(rates[i]['ep'] + 1, base))
        weight.append(log(rates[i]['ep'] + 1, base))
    return data, res, weight
def concatenate(a, b):
    for i in range(len(a)):
        a[i].extend(b[i])
def getMaxEp():
    server = 3
    global maxEp
    for eventId in range(226, 276):
        eventData, startAt, endAt = getEventData(eventId, server)
        for tier in tierListOfServer[server]:
            cutoffs = get_json_from_url(f"{Bestdoriurl}/api/tracker/data?server={server}&event={eventId}&tier={tier}")['cutoffs']
            if len(cutoffs) == 0:
                continue
            rates = processCutoffs(cutoffs, startAt)
            maxEp[eventData[0][0]] = max(maxEp[eventData[0][0]], max(i['ep'] for i in rates))

def getAllData(tier):
    server = 3
    inputs = [[] for i in range(8)]
    outputs = [[]]
    inputs_test = [[] for i in range(8)]
    outputs_test = [[]]
    weight = []
    for eventId in range(226, presentEvent):
        # print(eventId)
        eventData, startAt, endAt = getEventData(eventId, server)
        cutoffs = get_json_from_url(f"{Bestdoriurl}/api/tracker/data?server={server}&event={eventId}&tier={tier}")['cutoffs']
        if len(cutoffs) == 0:
            continue
        rates = processCutoffs(cutoffs, startAt)
        timeData, epData, tmpWeight = getTimeAndSequenceData(rates, startAt, endAt, eventData[0][0])
        tmp = []
        tmp.extend(eventData)
        tmpData = [[] for i in range(2)]
        for i in range(len(tmpWeight)):
            concatenate(tmpData, tmp)
        tmpData.extend(timeData)
        weight.extend(i / (presentEvent - eventId) for i in tmpWeight)
        if eventId < 270:
            concatenate(inputs, tmpData)
            concatenate(outputs, epData)
        else:
            concatenate(inputs_test, tmpData)
            concatenate(outputs_test, epData)
    return inputs, outputs, inputs_test, outputs_test, weight
def continuePredict(eventId, tier, server, rates):
    global step_length, maxEp
    eventData, startAt, endAt = getEventData(eventId, server)
    base = maxEp[eventData[0][0]]
    list = []
    S = 0
    for i in range(len(rates) - step_length, len(rates)):
        cur = 0 if i <= 0 else rates[i]['ep']
        list.append([log(cur + 1, base)])
        S += log(cur + 1, base)
    cur = rates[-1]['time'] + time_length
    result = [{'time': rates[-1]['time'], 'ep': sum([info['ep'] for info in rates])}]
    while cur <= endAt:
        inputs = []
        inputs.extend(eventData)
        inputs.extend(getTimeData(cur, startAt, endAt))
        inputs.append([S / step_length])
        ep = predict(inputs, tier)
        list.append([ep])
        last = list.pop(0)
        S += ep - last[0]
        # print(S, sum(pow(base, i[0]) - 1 for i in list))
        result.append({'time': cur, 'ep': pow(base, ep) - 1})
        cur += time_length
    for i in range(1, len(result)):
        result[i]['ep'] += result[i - 1]['ep']
    return result
def predictOnce(eventId, tier, server, rates):
    global step_length, maxEp
    eventData, startAt, endAt = getEventData(eventId, server)
    base = maxEp[eventData[0][0]]
    list = []
    S = 0
    for i in range(len(rates) - step_length, len(rates)):
        cur = 0 if i <= 0 else rates[i]['ep']
        list.append([log(cur + 1, base)])
        S += log(cur + 1, base)
    cur = rates[-1]['time'] + time_length
    result = []
    inputs = []
    inputs.extend(eventData)
    inputs.extend(getTimeData(cur, startAt, endAt))
    inputs.append([S / step_length])
    ep = predict(inputs, tier)
    # print(ep, pow(base, ep) - 1)
    result.append({'time': cur, 'ep': pow(base, ep) - 1})
    return result
# getMaxEp()
# print(maxEp)