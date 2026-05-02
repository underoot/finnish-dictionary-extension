import type { Message, MessageResult } from '../types';

export async function sendMessage(msg: Message): Promise<MessageResult> {
  return chrome.runtime.sendMessage(msg);
}
