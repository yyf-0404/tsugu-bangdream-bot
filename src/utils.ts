import { tierListOfServer } from './config'
import { h, Element } from 'koishi'

// 将messageList转换为Array<Element | string>  用于session.send
export function paresMessageList(list?: Array<Buffer | string>): Array<Element | string> {
    if (!list) {
        return []
    }
    let messageList = []
    for (let i = 0; i < list.length; i++) {
        parseMessage(list[i])
    }

    function parseMessage(message: Buffer | string) {
        if (typeof message == 'string') {
            messageList.push(message)
        } else if (message instanceof Buffer) {
            messageList.push(h.image(message, 'image/png'))
        }
    }

    return messageList
}

//将tierListOfServer转换为文字，server:tier,tier,tier
export function tierListOfServerToString(): string {
    let tierListString = ''
    for (var i in tierListOfServer) {
        tierListString += i + ' : '
        for (var j in tierListOfServer[i]) {
            tierListString += tierListOfServer[i][j] + ', '
        }
        tierListString += '\n'
    }
    return tierListString
}

//判断左侧5个或者6个是否为数字
export function checkLeftDigits(str: string): number {
    const regexSixDigits = /^(\d{6})/;
    const regexFiveDigits = /^(\d{5})/;

    const sixDigitsMatch = str.match(regexSixDigits);
    if (sixDigitsMatch) {
        return parseInt(sixDigitsMatch[1]);
    }

    const fiveDigitsMatch = str.match(regexFiveDigits);
    if (fiveDigitsMatch) {
        return parseInt(fiveDigitsMatch[1]);
    }

    return 0;
}

//将string Array 转化为 number Array，修复displayedServerList koishi数据库类型错误
export function stringArrayToNumberArray(strArray: any[]): number[] {
    let numArray: number[] = []
    for (let i = 0; i < strArray.length; i++) {
        numArray.push(parseInt(strArray[i]))
    }
    return numArray
}

export function parseTimeToMinutes(timeStr: string): number {
    const m = timeStr.toLowerCase().match(/^(\d+)(min|h|m)?$/)
    return m ? parseFloat(m[1]) * (m[2] === 'h' ? 60 : 1) : undefined;
}

export function parseDate(str: string): Date | undefined {
    const m = str.match(/^(?:(\d{4})[/.](\d{1,2})[/.](\d{1,2})|(\d{1,2})[/.](\d{1,2}))$/);
    if (!m) return;
    if (m[1]) return new Date(+m[1], +m[2] - 1, +m[3]);
    const now = new Date();
    const d = new Date(now.getFullYear(), +m[4] - 1, +m[5]);
    const limit = new Date(now); limit.setMonth(now.getMonth() + 1);
    return d > limit ? new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()) : d;
}
