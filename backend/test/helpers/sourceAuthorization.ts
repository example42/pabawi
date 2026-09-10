import type { RequestHandler } from "express";
export const allowAllSources: RequestHandler = (req, _res, next) => {
  req.authorizedSources ??= ["bolt", "ansible", "ssh", "puppetdb", "puppetserver", "hiera", "aws", "azure", "proxmox", "checkmk"];
  next();
};
