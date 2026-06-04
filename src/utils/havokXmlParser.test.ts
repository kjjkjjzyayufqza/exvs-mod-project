import { describe, expect, it } from "vitest";
import { parseHavokXML } from "./havokXmlParser";

/** Minimal meshTree with one section whose primitive references a missing shared vertex slot. */
const brokenSharedVertexXml = `<?xml version="1.0" encoding="utf-8"?>
<hkpackfile>
  <field name="objects">
    <array count="1" elementtypeid="type1">
      <record>
        <field name="meshTree">
          <record>
            <field name="domain">
              <record>
                <field name="min"><array count="4" elementtypeid="type48"><real dec="0" hex="0"/><real dec="0" hex="0"/><real dec="0" hex="0"/><real dec="1" hex="3f800000"/></array></field>
                <field name="max"><array count="4" elementtypeid="type48"><real dec="1" hex="3f800000"/><real dec="1" hex="3f800000"/><real dec="1" hex="3f800000"/><real dec="1" hex="3f800000"/></array></field>
              </record>
            </field>
            <field name="sections">
              <array count="1" elementtypeid="type386">
                <record>
                  <field name="codecParms"><array count="6" elementtypeid="type48"><real dec="0" hex="0"/><real dec="0" hex="0"/><real dec="0" hex="0"/><real dec="0.001" hex="3a83126f"/><real dec="0.001" hex="3a83126f"/><real dec="0.001" hex="3a83126f"/></array></field>
                  <field name="firstPackedVertexIndex"><integer value="0"/></field>
                  <field name="firstSharedVertexIndex"><integer value="0"/></field>
                  <field name="firstPrimitiveIndex"><integer value="0"/></field>
                  <field name="numPackedVertices"><integer value="1"/></field>
                  <field name="numPrimitives"><integer value="1"/></field>
                </record>
              </array>
            </field>
            <field name="packedVertices">
              <array count="1" elementtypeid="type136"><integer value="0"/></array>
            </field>
            <field name="sharedVerticesIndex">
              <array count="0" elementtypeid="type136"></array>
            </field>
            <field name="sharedVertices">
              <array count="0" elementtypeid="type136"></array>
            </field>
            <field name="primitives">
              <array count="1" elementtypeid="type388">
                <record>
                  <field name="indices">
                    <array count="4" elementtypeid="type135">
                      <integer value="0"/>
                      <integer value="1"/>
                      <integer value="1"/>
                      <integer value="1"/>
                    </array>
                  </field>
                </record>
              </array>
            </field>
          </record>
        </field>
      </record>
    </array>
  </field>
</hkpackfile>`;

describe("parseHavokXML", () => {
  it("throws when a primitive references a shared vertex slot that is missing from sharedVerticesIndex", () => {
    expect(() => parseHavokXML(brokenSharedVertexXml)).toThrow(/Shared vertex index out of range/);
  });
});
