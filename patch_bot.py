import re

with open('/home/ubuntu/bot_project/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add multer and execSync at top if not present
if 'const multer' not in content:
    content = "const multer = require('multer');\nconst upload = multer({ dest: '/tmp/' });\nconst { execSync } = require('child_process');\n" + content

# 2. Update PROVINCE_MAP
old_map = """const PROVINCE_MAP = {
  'antananarivo': 'antananarivo', 'tana': 'antananarivo',
  'fianarantsoa': 'fianarantsoa', 'fianar': 'fianarantsoa',
  'toamasina': 'toamasina', 'tamatave': 'toamasina',
  'mahajanga': 'mahajanga', 'majunga': 'mahajanga',
  'toliara': 'toliara', 'tulear': 'toliara',
  'antsiranana': 'antsiranana', 'diego': 'antsiranana'
};"""

new_map = """const PROVINCE_MAP = {
  'antananarivo': 'antananarivo', 'tana': 'antananarivo',
  'fianarantsoa': 'fianarantsoa', 'fianar': 'fianarantsoa',
  'toamasina': 'toamasina', 'tamatave': 'toamasina',
  'mahajanga': 'mahajanga', 'majunga': 'mahajanga',
  'toliara': 'toliara', 'tulear': 'toliara',
  'antsiranana': 'antsiranana', 'diego': 'antsiranana',
  'itasy': 'itasy', 'miarinarivo': 'itasy',
  'analanjirofo': 'analanjirofo', 'fenarivo': 'analanjirofo'
};"""

if old_map in content:
    content = content.replace(old_map, new_map)

# 3. Update BACC_CONFIG
old_config_end = """  antsiranana: {
    name: 'Antsiranana',
    type: 'api_json',
    baseUrl: 'https://diego-api.bacc.digital.gov.mg/api/search',
    endpoints: {
      nom: '/name/',
      mle: '/num/'
    }
  }
};"""

new_config_end = """  antsiranana: {
    name: 'Antsiranana',
    type: 'api_json',
    baseUrl: 'https://diego-api.bacc.digital.gov.mg/api/search',
    endpoints: {
      nom: '/name/',
      mle: '/num/'
    }
  },
  itasy: {
    name: 'Itasy',
    type: 'custom',
    baseUrl: ''
  },
  analanjirofo: {
    name: 'Analanjirofo',
    type: 'custom',
    baseUrl: ''
  }
};"""

if old_config_end in content:
    content = content.replace(old_config_end, new_config_end)

with open('/home/ubuntu/bot_project/index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch basic applied successfully.")
