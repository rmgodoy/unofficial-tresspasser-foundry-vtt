export async function handleUpdateChatMessage(data, senderId) {
  if (!game.user.isGM) return;

  const { messageId, updates } = data;
  const msg = game.messages.get(messageId);
  
  if (msg) {
    console.log(`Trespasser | handleUpdateChatMessage: GM updating message ${messageId} on behalf of ${senderId}`);
    await msg.update(updates);
  } else {
    console.warn(`Trespasser | handleUpdateChatMessage: Message ${messageId} not found.`);
  }
}
