"""Validate original videos, then install them under stable first BTEC URLs."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "public/videos/first-btec"


def inspect_video(file):
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_type,codec_name", "-of", "json", str(file)],
        capture_output=True, text=True, check=True,
    )
    metadata = json.loads(probe.stdout)
    if not 0 < float(metadata["format"]["duration"]):
        raise ValueError(f"Invalid duration: {file.name}")
    if not any(s["codec_type"] == "video" and s["codec_name"] == "h264" for s in metadata["streams"]):
        raise ValueError(f"No browser-compatible H.264 video track: {file.name}")
    if file.stat().st_size >= 100 * 1024 * 1024:
        raise ValueError(f"File exceeds GitHub's file size limit: {file.name}")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-xerror", "-i", str(file), "-map", "0:v:0",
         "-t", "1", "-f", "null", "-"], check=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("mapping", type=Path, nargs="?",
                        help="JSON object mapping each lesson ID to the exact MP4 member in the ZIP")
    args = parser.parse_args()

    units = json.loads((ROOT / "data/first-btec-lessons.json").read_text())
    lessons = {lesson["id"]: lesson["name"] for unit in units for lesson in unit["lessons"]}
    with ZipFile(args.archive) as archive:
        videos = [item.filename for item in archive.infolist()
                  if not item.is_dir() and Path(item.filename).suffix.lower() == ".mp4"]
        if not args.mapping:
            print(json.dumps({"lessons": lessons, "mp4_members": videos}, ensure_ascii=False, indent=2))
            return
        mapping = json.loads(args.mapping.read_text())
        if set(mapping) != set(lessons) or len(set(mapping.values())) != len(lessons):
            parser.error("map all 25 lesson IDs to distinct ZIP members")
        if any(videos.count(member) != 1 for member in mapping.values()):
            parser.error("each mapped MP4 member must exist exactly once")
        if TARGET.exists():
            parser.error(f"an existing video installation is at {TARGET}")
        with TemporaryDirectory(dir=TARGET.parent) as temp:
            staged = Path(temp) / "first-btec"
            staged.mkdir()
            for lesson, member in mapping.items():
                output = staged / (lesson + ".mp4")
                with archive.open(member) as source, output.open("wb") as destination:
                    shutil.copyfileobj(source, destination)
                inspect_video(output)
            staged.rename(TARGET)
    print(f"Verified and installed {len(lessons)} videos in {TARGET}.")


if __name__ == "__main__":
    main()
