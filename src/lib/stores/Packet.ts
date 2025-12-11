export abstract class Packet {
  public sourceId: string;
  public targetId: string;
  public currentLinkId: string;

  constructor(sourceId: string, targetId: string, currentLinkId: string) {
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.currentLinkId = currentLinkId;
  }
}
