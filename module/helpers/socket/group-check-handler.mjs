import { TrespasserPartyHelper } from "../party-helper.mjs";

export async function handleGroupCheckSubmitRoll(data, senderId) {
  if (!game.user.isGM) return;

  const { messageId, result } = data;
  const msg = game.messages.get(messageId);
  if (!msg) {
    console.warn(`Trespasser | Group Check Message ${messageId} not found.`);
    return;
  }

  const flags = msg.flags.trespasser?.groupCheck;
  if (!flags || flags.status === "completed") return;

  // Clone current results to append the new one
  const currentResults = [...(flags.results || [])];
  
  // Ignore if this actor already rolled (prevents duplicate submissions)
  if (currentResults.some(r => r.actorId === result.actorId)) return;

  currentResults.push(result);

  const updates = {
    "flags.trespasser.groupCheck.results": currentResults,
    content: TrespasserPartyHelper.buildGroupCheckPendingHtml(flags.checkLabel, flags.dc, flags.participants, currentResults)
  };

  await msg.update(updates);

  // Check if all participants have rolled
  if (currentResults.length >= flags.participants.length) {
    await TrespasserPartyHelper.finalizeGroupCheck(messageId);
  }
}
