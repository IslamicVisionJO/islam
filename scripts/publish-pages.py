"""Publish a built dist to the existing gh-pages history, without switching or resetting source."""
import pathlib,subprocess,os,tempfile,json,hashlib,sys
root=pathlib.Path(__file__).resolve().parents[1];dist=root/'dist'
def git(*args,**kwargs):return subprocess.check_output(['git','-C',str(root),*args],text=True,**kwargs).strip()
if not (dist/'index.html').is_file():raise SystemExit('Build the production site first.')
if 'class="review-preview-banner"' in (dist/'index.html').read_text():raise SystemExit('Candidate review builds cannot be published.')
revision=pathlib.Path('content/BTEC_Islamic_Education_Revision.pdf')
pdfs={file.relative_to(dist) for file in dist.rglob('*.pdf')}
allowed_pdfs={revision,*(pathlib.Path('revision-downloads',name+'.pdf') for name in ('full','semester-1','semester-2'))}
if pdfs!=allowed_pdfs:raise SystemExit('Unexpected or missing revision PDF in dist.')
for pdf in allowed_pdfs:
 if (dist/pdf).read_bytes()!=(root/'public'/pdf).read_bytes():raise SystemExit('Incorrect revision PDF: '+str(pdf))
if (dist/'first-btec-review').exists():raise SystemExit('First BTEC question candidates cannot be published.')
second_btec=json.loads((root/'data/learning-manifest.json').read_text())['units']
first_btec=json.loads((root/'data/first-btec-lessons.json').read_text())
expected_videos={pathlib.Path(lesson['video']) for unit in second_btec for lesson in unit['lessons']}
expected_videos.update(pathlib.Path('videos/first-btec',lesson['id']+'.mp4') for unit in first_btec for lesson in unit['lessons'])
built_videos={file.relative_to(dist) for file in (dist/'videos').rglob('*.mp4')}
if built_videos!=expected_videos:
 raise SystemExit('The built videos do not match the first and second BTEC lesson catalogs.')
source=git('rev-parse','HEAD');git('fetch','origin','gh-pages');parent=git('rev-parse','FETCH_HEAD')
old_files=git('ls-tree','--name-only',parent).splitlines()
if 'release.json' in old_files:
 deployed=json.loads(git('show',parent+':release.json')).get('sourceCommit')
 if not deployed or subprocess.run(['git','-C',str(root),'merge-base','--is-ancestor',deployed,source]).returncode:
  raise SystemExit('The built source must include the release already on gh-pages.')
if git('hash-object',str(dist/'index.html'))!=git('rev-parse',source+':dist/index.html'):
 raise SystemExit('Commit the tested HTML before packaging a release.')
if 'CNAME' in old_files:(dist/'CNAME').write_text(git('show',parent+':CNAME')+'\n')
(dist/'.nojekyll').write_text('')
release={'sourceCommit':source,'buildSha256':hashlib.sha256((dist/'index.html').read_bytes()).hexdigest(),'name':'التربية الإسلامية برؤية رقمية'}
(dist/'release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
with tempfile.TemporaryDirectory(prefix='islam-pages-',dir='/tmp') as tmp:
 env={**os.environ,'GIT_INDEX_FILE':tmp+'/index'}
 def stage(*args):return subprocess.check_output(['git','-C',str(dist),'--git-dir='+str(root/'.git'),'--work-tree='+str(dist),*args],env=env,text=True).strip()
 stage('read-tree','--empty');stage('add','-A','-f','--','.');tree=stage('write-tree')
 commit=git('commit-tree',tree,'-p',parent,input='Publish digital Islamic education platform from '+source+'\n')
 git('update-ref','refs/heads/pages-digital-release',commit)
 print('Prepared release commit:',commit,flush=True)
 if '--push' in sys.argv:
  subprocess.run(['git','-C',str(root),'push','origin',commit+':refs/heads/gh-pages'],check=True)
  print('gh-pages updated. Verify the actual Pages deployment separately.',flush=True)
 else:print('Dry preparation only; pass --push to update gh-pages.')
