import dns from 'node:dns';

const dnsFromEnv = process.env.NODE_DNS_SERVERS?.split(/[\s,]+/).filter(Boolean);
if (process.env.VERCEL !== '1' && process.env.VERCEL !== 'true') {
  dns.setServers(dnsFromEnv?.length ? dnsFromEnv : ['1.1.1.1', '8.8.8.8']);
}
