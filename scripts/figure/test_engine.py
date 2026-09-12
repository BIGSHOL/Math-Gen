import copy
import json
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
from service import render

TRIANGLE = json.loads(Path(__file__).with_name('engine-catalog.json').read_text(encoding='utf-8'))['v2_example']

class EngineTests(unittest.TestCase):
    def check_svg(self, spec):
        svg = render(spec)['svg']
        root = ET.fromstring(svg)
        self.assertTrue(root.tag.endswith('svg'))
        self.assertIn('viewBox', root.attrib)
        self.assertGreater(float(root.attrib['width']), 0)
        self.assertGreater(float(root.attrib['height']), 0)
        self.assertNotIn('<script', svg.lower())
        return svg

    def test_triangle_keeps_labels_without_invented_measurement_bows(self):
        svg = self.check_svg(TRIANGLE)
        for label in ('A', 'B', 'C', '3'):
            self.assertIn('>' + label + '<', svg)
        self.assertNotIn('stroke-dasharray', svg)

    def test_right_angle_must_be_geometrically_true(self):
        spec = copy.deepcopy(TRIANGLE)
        spec['points']['C'] = [290, 160]
        with self.assertRaises(ValueError): render(spec)

    def test_unknown_point_is_rejected(self):
        spec = copy.deepcopy(TRIANGLE)
        spec['segments']['AB'] = ['A', 'missing']
        with self.assertRaises(ValueError): render(spec)

    def test_region_and_circle_arc(self):
        self.check_svg({'version': 2, 'points': {'O': [100,100], 'A':[160,100], 'B':[100,40]},
            'circles': {'c': {'center':'O','radius':60,'draw':False}},
            'regions': {'sector': {'boundary':[{'seg':['O','A']},{'arc':{'circle':'c','from':'A','to':'B','dir':'ccw'}},{'seg':['B','O']}], 'fill':'#f2d5c8'}}})

    def test_elementary_and_solid_renderers(self):
        for spec in [
            {'kind':'cuboid','w':4,'d':3,'h':2},
            {'kind':'sphere','r':3},
            {'kind':'fracBars','cols':4,'rows':1,'filled':3},
            {'kind':'barChart','values':[{'label':'A','value':3},{'label':'B','value':5}],'yMax':6,'yStep':1},
            {'kind':'linearGraph','lines':[{'slope':1,'yIntercept':1}], 'xRange':[-3,3], 'yRange':[-3,4]},
            {'kind':'curveGraph','curves':[{'type':'quadratic','a':1,'p':0,'q':0}], 'xRange':[-3,3], 'yRange':[-1,5]},
            {'kind':'numberLine','max':10},
            {'kind':'assetScene','items':[{'asset':'train-side','x':20,'y':20,'w':120}],'canvas':[180,100]},
        ]:
            with self.subTest(kind=spec['kind']): self.check_svg({'version':'elem-1',**spec})

    def test_oversized_input_is_rejected(self):
        with self.assertRaises(ValueError): render({'version':2,'extra':'x'*65536})

    def test_annotated_parabola_with_finite_horizontal_segment(self):
        from graph_scene import CONTRACT
        svg = self.check_svg(CONTRACT['example'])
        self.assertIn('y = 9', svg)
        self.assertIn('−3', svg)
        self.assertGreater(svg.count('<line'), 2)
        self.assertNotIn('<marker', svg)

    def test_graph_rejects_nonfinite_coordinates_and_escapes_labels(self):
        from graph_scene import CONTRACT
        spec = copy.deepcopy(CONTRACT['example'])
        spec['curves'][0]['coefficients'] = [float('nan')]
        with self.assertRaises(ValueError): render(spec)
        spec = copy.deepcopy(CONTRACT['example'])
        spec['labels'][0]['text'] = '<script>alert(1)</script>'
        svg = self.check_svg(spec)
        self.assertNotIn('<script>', svg)

    def test_no_code_or_external_image_escape(self):
        with self.assertRaises(ValueError): render({'version':2,'svg':'<script>alert(1)</script>'})

if __name__ == '__main__': unittest.main()
