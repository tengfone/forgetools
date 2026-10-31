import { textTool } from './textTool';
import { decodeSaml } from '../lib/crypto';
import { bytesToBase64, toUtf8 } from '../lib/bytes';

export const render = textTool({
  prefix: 'saml',
  inputLabel: 'SAMLRequest / SAMLResponse (Base64 or redirect URL)',
  outputLabel: 'XML',
  sample: {
    input: bytesToBase64(
      toUtf8(
        '<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6" Version="2.0" IssueInstant="2024-01-01T00:00:00Z" AssertionConsumerServiceURL="https://sp.example.com/acs"><saml:Issuer>https://sp.example.com</saml:Issuer></samlp:AuthnRequest>',
      ),
    ),
  },
  run: async (s) => (await decodeSaml(s)).xml,
  okMessage: () => 'Decoded',
});
