import { Server } from "@/types/Server";
import { tsuguUser } from "@/database/userDB";

export function generateVerifyCode(): number {
    let verifyCode: number;
    do {
        verifyCode = Math.floor(Math.random() * (99999 - 10000 + 1)) + 10000;
    } while (verifyCode.toString().includes('64') || verifyCode.toString().includes('89'));
    return verifyCode
}

export function isInteger(char: string): boolean {
    const regex = /^(0|[1-9]\d*)$/;
    return regex.test(char);
}

function imageBufferToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
}

export function listToBase64(list: Array<Buffer | string>): Array<{ type: 'string' | 'base64', string: string }> {
    if (!list) {
        return []
    }
    const result: Array<{ type: 'string' | 'base64', string: string }> = []

    for (let i = 0; i < list.length; i++) {
        parseMessage(list[i])
    }
    function parseMessage(message: Buffer | string) {
        if (typeof message == 'string') {
            result.push({
                type: 'string',
                string: message
            })
        }
        else if (message instanceof Buffer) {
            result.push({
                type: 'base64',
                string: imageBufferToBase64(message)
            })
        }
    }

    return result
}

function parseDateLiteral(input: string): Date | null {
    const match = input.trim().match(/^(\d{4})[.-](\d{2})[.-](\d{2})$/)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null
    return date
}

function getDateStart(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function getNextDateStart(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
}

export function parseSearchDate(input: string): { rangeStart?: number; rangeEnd?: number } | null {
    const normalizedInput = input.trim().replace(/^＞/, '>').replace(/^＜/, '<')
    const relationMatch = normalizedInput.match(/^([<>])\s*(.+)$/)
    if (relationMatch) {
        const date = parseDateLiteral(relationMatch[2])
        if (!date) return null
        return relationMatch[1] === '>'
            ? { rangeStart: getNextDateStart(date) }
            : { rangeEnd: getDateStart(date) }
    }
    const rangeMatch = normalizedInput.match(/^(\d{4}[.-]\d{2}[.-]\d{2})\s*[-~]\s*(\d{4}[.-]\d{2}[.-]\d{2})$/)
    if (rangeMatch) {
        const startDate = parseDateLiteral(rangeMatch[1])
        const endDate = parseDateLiteral(rangeMatch[2])
        if (!startDate || !endDate) return null
        return {
            rangeStart: Math.min(getDateStart(startDate), getDateStart(endDate)),
            rangeEnd: Math.max(getNextDateStart(startDate), getNextDateStart(endDate)),
        }
    }
    const date = parseDateLiteral(normalizedInput)
    return date ? { rangeStart: getDateStart(date), rangeEnd: getNextDateStart(date) } : null
}
